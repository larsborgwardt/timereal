#!/usr/bin/env bash
# Gemeinsamer SFTP-Vertrag; diese Datei führt allein keinen Auftrag aus.
backup_ziel_pruefen() {
  [[ $1 =~ ^sftp:([a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?[a-zA-Z0-9][a-zA-Z0-9.-]*:/[a-zA-Z0-9_./-]+$ ]] || {
    echo 'SFTP-Ziel benötigt sftp:benutzer@ssh-host:/absoluter/pfad (ohne Leer- oder Shellzeichen).' >&2; return 2;
  }
}
backup_restic() {
  env -u RESTIC_PASSWORD -u RESTIC_PASSWORD_COMMAND -u RESTIC_REPOSITORY \
    RESTIC_REPOSITORY_FILE="$backup_config/repository" RESTIC_PASSWORD_FILE="$backup_config/password" \
    restic -o 'sftp.args=-oBatchMode=yes -oStrictHostKeyChecking=yes -oConnectTimeout=10' "$@"
}
