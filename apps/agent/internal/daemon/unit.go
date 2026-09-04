package daemon

const (
	Unit     = "pupitred"
	UnitPath = "/etc/systemd/system/pupitred.service"
)

// The outgoing half of the agent runs on its own, apart from the ssh sessions: a client who never opens the app still has his keys and his entitlement up to date.
const UnitFile = `[Unit]
Description=Pupitre agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/pupitred daemon
Restart=always
RestartSec=10s
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`
