#ifndef BENZA_VISION_H
#define BENZA_VISION_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct benza_scan benza_scan;
// Handles are single-use. Keep alive until run returns; then destroy.
benza_scan *benza_scan_create(void);
void benza_scan_cancel(benza_scan *scan);
int benza_scan_is_running(benza_scan *scan);
// Diagnostic stage only: 0=idle, 1=weights, 2=projector, 3=context,
// 4=tokenization, 5=image evaluation, 6=generation, 7=reply ready.
int benza_scan_stage(benza_scan *scan);
// Returns 0 if destroyed, 3 if still running. Never destroy a running handle.
int benza_scan_destroy(benza_scan *scan);
// Synchronous worker API. Call off the UI thread with verified local assets.
// 0=reply ready (requires strict validation), 1=error, 2=canceled/timeout,
// 3=another worker active, 4=handle already used. Output is empty on failure.
int benza_scan_rgb(benza_scan *scan, const char *model_path,
                   const char *projector_path, const char *catalogue_prompt,
                   const uint8_t *rgb, size_t rgb_bytes,
                   uint32_t width, uint32_t height, int use_gpu,
                   int timeout_seconds, char *output, size_t output_bytes);
#ifdef __cplusplus
}
#endif
#endif
