FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV container=docker

# What a host hands over with a freshly provisioned machine. It is a fixture,
# not a secret, and `core.hardening` is what closes this door — the step the rig
# exists to exercise.
#
# An empty value makes the machine open with nothing at all: no key, no password,
# sshd accepting the `none` method. Handy for a shell, wrong for the onboarding —
# the app then sees a machine that already opens, installs no key of its own, and
# the hardening refuses to close root for want of a key that opens `dev`.
ARG ROOT_PASSWORD=pupitre

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      systemd systemd-sysv dbus dbus-user-session \
      openssh-server sudo ca-certificates curl locales tzdata iproute2 iputils-ping \
 && rm -rf /var/lib/apt/lists/*

# sshd runs outright rather than on socket activation. Ubuntu 24.04 prefers the
# socket, but in this container it never came up: the port answered because
# Docker's proxy accepts the connection, then reset it because nothing was
# behind it — which reads as « responds, but it is not SSH access ».
RUN systemctl set-default multi-user.target \
 && systemctl mask \
      console-getty.service \
      systemd-udevd.service \
      systemd-udevd-control.socket \
      systemd-udevd-kernel.socket \
      systemd-modules-load.service \
      sys-kernel-config.mount \
      sys-kernel-debug.mount \
      sys-kernel-tracing.mount \
 \
 && systemctl disable ssh.socket \
 && systemctl enable ssh.service

RUN userdel -r ubuntu 2>/dev/null || true

RUN if [ -n "${ROOT_PASSWORD}" ]; then \
      echo "root:${ROOT_PASSWORD}" | chpasswd; \
    else \
      passwd -d root; \
    fi

# sshd hands the empty password to PAM, which only accepts one where pam_unix
# says `nullok`. Ubuntu ships it that way; saying it here means the rig does not
# depend on that staying true.
RUN grep -q 'pam_unix\.so.*nullok' /etc/pam.d/common-auth \
 || sed -i 's/\(pam_unix\.so\)/\1 nullok/' /etc/pam.d/common-auth

# The identity of the machine, made here and kept on a volume.
#
# Docker copies this directory into the named volume the first time it mounts
# it, and never again: the keys therefore survive every rebuild, and only
# `docker compose down -v` makes a new machine — which is meant to. Making them
# at build time rather than at boot is what takes systemd's ordering out of the
# question: sshd with no host key does not start at all, and answers a TCP
# connection with nothing.
RUN mkdir -p /etc/ssh/hostkeys \
 && chmod 700 /etc/ssh/hostkeys \
 && ssh-keygen -q -t ed25519 -f /etc/ssh/hostkeys/ssh_host_ed25519_key -N "" \
 && ssh-keygen -q -t rsa -b 4096 -f /etc/ssh/hostkeys/ssh_host_rsa_key -N ""

COPY sshd-test.conf /etc/ssh/sshd_config.d/50-pupitre-test.conf
COPY hostkeys.service /etc/systemd/system/pupitre-hostkeys.service

RUN chmod 644 /etc/ssh/sshd_config.d/50-pupitre-test.conf \
 && systemctl enable pupitre-hostkeys.service

# Optional, and empty by default: a public key here opens root without the
# password, which is what the shell flows below want — pushing a dev binary,
# running the staging tests. The app needs none of it: it installs its own key
# over the password session, as it would on a machine bought from a host.
ARG AUTHORIZED_KEY=""

RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh \
 && printf '%s\n' "${AUTHORIZED_KEY}" > /root/.ssh/authorized_keys \
 && chmod 600 /root/.ssh/authorized_keys \
 && chown root:root /root/.ssh/authorized_keys

EXPOSE 22
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
