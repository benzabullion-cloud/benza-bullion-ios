/* Linux experiment isolation: deny IPv4/IPv6 sockets in the model process. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <sys/socket.h>

int socket(int domain, int type, int protocol) {
    if (domain == AF_INET || domain == AF_INET6) {
        errno = EPERM;
        return -1;
    }
    int (*original)(int, int, int) = dlsym(RTLD_NEXT, "socket");
    if (!original) { errno = ENOSYS; return -1; }
    return original(domain, type, protocol);
}
