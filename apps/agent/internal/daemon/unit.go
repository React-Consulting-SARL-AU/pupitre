package daemon

const (
	Unit     = "pupitred"
	UnitPath = "/etc/systemd/system/pupitred.service"

	ResumeUnit     = "pupitre-resume"
	ResumeUnitPath = "/etc/systemd/system/pupitre-resume.service"
)

// The projects that were up when the machine went down come back with it.
//
// This runs apart from the daemon on purpose: the daemon lives in a private
// /tmp, and a tmux server it started would put its socket where no ssh session
// of the client can find it. A oneshot has no sandbox to keep, runs once per
// boot, and leaves the session where the agent and the reader's own shell look
// for it. The unit stays active once done: the tmux server it opened lives in
// its cgroup, and a oneshot that ended would take it along.
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
ProtectSystem=strict
StateDirectory=pupitre
ReadWritePaths=/var/log /home/dev/.ssh
ProtectKernelTunables=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

[Install]
WantedBy=multi-user.target
`
