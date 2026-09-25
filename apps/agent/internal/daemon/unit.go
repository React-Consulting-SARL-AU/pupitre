package daemon

const (
	Unit     = "pupitred"
	UnitPath = "/etc/systemd/system/pupitred.service"

	ResumeUnit     = "pupitre-resume"
	ResumeUnitPath = "/etc/systemd/system/pupitre-resume.service"
)

// Apart from the daemon, whose private /tmp would hide the tmux socket; RemainAfterExit keeps tmux alive in its cgroup.
const ResumeUnitFile = `[Unit]
Description=Pupitre projects, back after a boot
After=network.target pupitred.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/pupitred resume

[Install]
WantedBy=multi-user.target
`

// /etc/pupitre stays writable for the server id and the credentials file a scheduled mongodump reads.
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
ProtectSystem=strict
StateDirectory=pupitre
ReadWritePaths=/var/log /home/dev/.ssh -/etc/pupitre
ProtectKernelTunables=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

[Install]
WantedBy=multi-user.target
`
