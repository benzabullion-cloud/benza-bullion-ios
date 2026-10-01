#include "BenzaVision.h"
#ifdef __APPLE__
#include <llama/llama.h>
#include <llama/mtmd.h>
#include <llama/mtmd-helper.h>
#else
#include <llama.h>
#include <mtmd.h>
#include <mtmd-helper.h>
#endif
#include <atomic>
#include <chrono>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>

struct benza_scan {
    std::atomic<bool> canceled{false};
    std::atomic<bool> running{false};
    std::atomic<bool> used{false};
    std::atomic<int> stage{0};
    std::chrono::steady_clock::time_point deadline;
};
static std::mutex worker_mutex;
static std::once_flag backend_once;

// The 1.5 GB language model and vision projector are immutable after loading.
// Keep them alive for the app process so a second side / subsequent scan does
// not reload both files from storage. All access stays behind worker_mutex.
static std::unique_ptr<llama_model, decltype(&llama_model_free)> cached_model(nullptr, llama_model_free);
static std::unique_ptr<mtmd_context, decltype(&mtmd_free)> cached_vision(nullptr, mtmd_free);
static std::string cached_model_path;
static std::string cached_projector_path;
static bool cached_use_gpu = false;
static bool stopped(benza_scan *scan) {
    return scan->canceled.load() || std::chrono::steady_clock::now() >= scan->deadline;
}
static bool abort_work(void *data) { return stopped(static_cast<benza_scan *>(data)); }
static bool load_progress(float, void *data) { return !abort_work(data); }
static void silent_log(ggml_log_level, const char *, void *) {}

extern "C" benza_scan *benza_scan_create(void) {
    try { return new benza_scan; } catch (...) { return nullptr; }
}
extern "C" void benza_scan_cancel(benza_scan *scan) {
    if (scan) scan->canceled.store(true);
}
extern "C" int benza_scan_is_running(benza_scan *scan) {
    return scan && scan->running.load() ? 1 : 0;
}
extern "C" int benza_scan_stage(benza_scan *scan) {
    return scan ? scan->stage.load() : 0;
}
extern "C" int benza_scan_destroy(benza_scan *scan) {
    if (!scan) return 0;
    if (scan->running.load()) return 3;
    delete scan;
    return 0;
}

extern "C" int benza_runtime_unload(void) {
    std::unique_lock<std::mutex> worker(worker_mutex, std::try_to_lock);
    if (!worker.owns_lock()) return 3;
    cached_vision.reset();
    cached_model.reset();
    cached_model_path.clear();
    cached_projector_path.clear();
    cached_use_gpu = false;
    return 0;
}

extern "C" int benza_scan_rgb(benza_scan *scan, const char *model_path,
                                const char *projector_path, const char *catalogue_prompt,
                                const uint8_t *rgb, size_t rgb_bytes,
                                uint32_t width, uint32_t height, int use_gpu,
                                int timeout_seconds, char *output, size_t output_bytes) {
    if (output && output_bytes) output[0] = '\0';
    if (!scan || !model_path || !projector_path || !catalogue_prompt || !rgb ||
        !output || output_bytes < 1025 || !width || !height ||
        width > 4096 || height > 4096 ||
        rgb_bytes != size_t(width) * height * 3 ||
        timeout_seconds < 1 || timeout_seconds > 120 ||
        std::strlen(catalogue_prompt) > 4096) return 1;
    std::unique_lock<std::mutex> worker(worker_mutex, std::try_to_lock);
    if (!worker.owns_lock()) return 3;
    if (scan->used.exchange(true)) return 4;
    scan->deadline = std::chrono::steady_clock::now() + std::chrono::seconds(timeout_seconds);
    scan->running.store(true);
    struct RunningGuard {
        benza_scan *scan;
        ~RunningGuard() { scan->running.store(false); }
    } running_guard{scan};
    try {
        if (stopped(scan)) return 2;
        std::call_once(backend_once, [] {
            llama_log_set(silent_log, nullptr);
            mtmd_log_set(silent_log, nullptr);
            ggml_backend_load_all();
            llama_backend_init();
        });
        const bool requested_gpu = use_gpu != 0;
        const bool cache_matches = cached_model && cached_vision &&
            cached_model_path == model_path &&
            cached_projector_path == projector_path &&
            cached_use_gpu == requested_gpu;
        if (!cache_matches) {
            // Never publish a partially loaded runtime.
            cached_vision.reset();
            cached_model.reset();
            cached_model_path.clear();
            cached_projector_path.clear();

            auto mp = llama_model_default_params();
            scan->stage.store(1);
            mp.n_gpu_layers = requested_gpu ? -1 : 0;
            mp.progress_callback = load_progress;
            mp.progress_callback_user_data = scan;
            std::unique_ptr<llama_model, decltype(&llama_model_free)> model(
                llama_model_load_from_file(model_path, mp), llama_model_free);
            if (!model || stopped(scan)) return stopped(scan) ? 2 : 1;

            auto vp = mtmd_context_params_default();
            scan->stage.store(2);
            vp.use_gpu = requested_gpu;
            vp.n_threads = 4;
            vp.warmup = false;
            vp.image_min_tokens = 256;
            vp.image_max_tokens = 256;
            vp.progress_callback = load_progress;
            vp.progress_callback_user_data = scan;
            std::unique_ptr<mtmd_context, decltype(&mtmd_free)> vision(
                mtmd_init_from_file(projector_path, model.get(), vp), mtmd_free);
            if (!vision || !mtmd_support_vision(vision.get()) || stopped(scan)) {
                return stopped(scan) ? 2 : 1;
            }

            cached_model = std::move(model);
            cached_vision = std::move(vision);
            cached_model_path = model_path;
            cached_projector_path = projector_path;
            cached_use_gpu = requested_gpu;
        }
        auto cp = llama_context_default_params();
        scan->stage.store(3);
        cp.n_ctx = 1024;
        cp.n_batch = 512;
        cp.n_ubatch = 512;
        cp.n_threads = 4;
        cp.n_threads_batch = 4;
        cp.abort_callback = abort_work;
        cp.abort_callback_data = scan;
        std::unique_ptr<llama_context, decltype(&llama_free)> context(
            llama_init_from_model(cached_model.get(), cp), llama_free);
        if (!context || stopped(scan)) return stopped(scan) ? 2 : 1;
        std::unique_ptr<mtmd_bitmap, decltype(&mtmd_bitmap_free)> bitmap(
            mtmd_bitmap_init(width, height, rgb), mtmd_bitmap_free);
        std::unique_ptr<mtmd_input_chunks, decltype(&mtmd_input_chunks_free)> chunks(
            mtmd_input_chunks_init(), mtmd_input_chunks_free);
        if (!bitmap || !chunks) return 1;
        // This template is fixed to the pinned Qwen3-VL model, not arbitrary models.
        std::string prompt = "<|im_start|>system\nYou are a helpful assistant<|im_end|>\n"
                             "<|im_start|>user\n";
        prompt += mtmd_default_marker();
        prompt += "\n";
        prompt += catalogue_prompt;
        prompt += "<|im_end|>\n<|im_start|>assistant\n";
        mtmd_input_text text{prompt.data(), prompt.size(), true, true};
        scan->stage.store(4);
        const mtmd_bitmap *images[] = {bitmap.get()};
        if (mtmd_tokenize(cached_vision.get(), chunks.get(), &text, images, 1)) return 1;
        if (stopped(scan)) return 2;
        llama_pos past = 0;
        scan->stage.store(5);
        if (mtmd_helper_eval_chunks(cached_vision.get(), context.get(), chunks.get(),
                                    0, 0, 512, true, &past)) return stopped(scan) ? 2 : 1;
        if (stopped(scan)) return 2;
        std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(
            llama_sampler_init_greedy(), llama_sampler_free);
        if (!sampler) return 1;
        const llama_vocab *vocab = llama_model_get_vocab(cached_model.get());
        std::string reply;
        scan->stage.store(6);
        bool finished = false;
        for (int i = 0; i < 64; ++i) {
            if (stopped(scan)) return 2;
            llama_token token = llama_sampler_sample(sampler.get(), context.get(), -1);
            if (llama_vocab_is_eog(vocab, token)) { finished = true; break; }
            char piece[256];
            int length = llama_token_to_piece(vocab, token, piece, sizeof(piece), 0, false);
            if (length < 0 || reply.size() + size_t(length) > 1024) return 1;
            reply.append(piece, size_t(length));
            auto batch = llama_batch_get_one(&token, 1);
            if (llama_decode(context.get(), batch)) return stopped(scan) ? 2 : 1;
        }
        if (stopped(scan)) return 2;
        if (!finished || reply.empty()) return 1;
        std::memcpy(output, reply.c_str(), reply.size() + 1);
        scan->stage.store(7);
        return 0;
    } catch (...) {
        output[0] = '\0';
        return 1;
    }
}
