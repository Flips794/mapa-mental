#!/usr/bin/env bash
# Instala o servidor do Mapa Mental como serviço do usuário (inicia ao entrar no computador).
# Uso: bash server/instalar-servico.sh      Remover: systemctl --user disable --now mapa-mental
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
UNIT="$HOME/.config/systemd/user/mapa-mental.service"
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Mapa Mental - servidor local (http://localhost:4580)
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now mapa-mental.service
echo "Pronto: abra http://localhost:4580"
