# Wegwerf-Gast für tests/betrieb-ci-native.sh: Debian 13 mit systemd.
# Keine Benutzerinstallation; der Marker erlaubt die nativen Proben.
FROM debian:trixie@sha256:9c6e381421d0f48d1b8133e573f33c185ee16cbf505eda9c4a8a4791b25ea8a6
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends systemd systemd-sysv dbus git ca-certificates procps \
  && apt-get clean \
  && touch /root/TIMEREAL_WEGWERFTEST
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
