package backup

import (
	"io"
	"slices"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/mongodb"
	"pupitre.studio/agent/internal/modules/db/mysql"
	"pupitre.studio/agent/internal/modules/db/postgres"
	"pupitre.studio/agent/internal/modules/db/redis"
)

type engine struct {
	name    string
	module  string
	format  string
	list    func(*modules.Context) ([]string, error)
	dump    func(*modules.Context, string, io.Writer) error
	restore func(ctx *modules.Context, name string, size int64, r io.Reader) error
	whole   *whole
}

// Belongs to no database, so it comes before them, in a backup as in a restore.
type whole struct {
	format  string
	dump    func(*modules.Context, io.Writer) error
	restore func(*modules.Context, io.Reader) error
}

var engines = []engine{
	{
		name: "postgres", module: postgres.ID, format: contract.BackupDumpPgCustom,
		list: postgres.Databases, dump: postgres.DumpTo, restore: postgres.RestoreFrom,
		whole: &whole{format: contract.BackupDumpPgRoles, dump: postgres.DumpRoles, restore: postgres.RestoreRoles},
	},
	{
		name: "mysql", module: mysql.ID, format: contract.BackupDumpSQL,
		list: mysql.Databases, dump: mysql.DumpTo, restore: mysql.RestoreFrom,
		whole: &whole{format: contract.BackupDumpMySQLUsers, dump: mysql.DumpUsers, restore: mysql.RestoreUsers},
	},
	{
		name: "mongodb", module: mongodb.ID, format: contract.BackupDumpMongoArchive,
		list: mongodb.Databases, dump: mongodb.DumpTo, restore: mongodb.RestoreFrom,
	},
	{
		name: "redis", module: redis.ID,
		whole: &whole{format: contract.BackupDumpRDB, dump: redis.Snapshot, restore: redis.RestoreSnapshot},
	},
}

type holding struct {
	engine  engine
	sibling *modules.Context
	names   []string
	err     error
}

// Includes the Redis snapshot; a name that cannot be carried is not an item.
func (h holding) items() []contract.BackupContentDatabase {
	var items []contract.BackupContentDatabase

	if h.engine.list == nil && h.engine.whole != nil {
		items = append(items, contract.BackupContentDatabase{Engine: h.engine.name, Name: contract.BackupWholeServer, Item: contract.DatabaseItem(h.engine.name, contract.BackupWholeServer)})
	}

	for _, name := range h.names {
		if carriable(name) {
			items = append(items, contract.BackupContentDatabase{Engine: h.engine.name, Name: name, Item: contract.DatabaseItem(h.engine.name, name)})
		}
	}

	return items
}

func (s *Service) holdings(ctx *modules.Context) []holding {
	remembered, _ := modules.Remembered(ctx.Sys(), s.options.Engine.InstallPath)

	var found []holding

	for _, candidate := range engines {
		if !slices.Contains(remembered.Modules, candidate.module) {
			continue
		}

		sibling, installed := s.installed(ctx, candidate.module)
		if !installed {
			continue
		}

		held := holding{engine: candidate, sibling: sibling}

		if candidate.list != nil {
			held.names, held.err = candidate.list(sibling)
		}

		found = append(found, held)
	}

	return found
}

func engineNamed(name string) (engine, bool) {
	for _, candidate := range engines {
		if candidate.name == name {
			return candidate, true
		}
	}

	return engine{}, false
}
