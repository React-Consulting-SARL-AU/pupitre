package db

import (
	"pupitre.studio/agent/internal/modules"
	_ "pupitre.studio/agent/internal/modules/db/mailpit"
	"pupitre.studio/agent/internal/modules/db/mongodb"
	"pupitre.studio/agent/internal/modules/db/mysql"
	"pupitre.studio/agent/internal/modules/db/postgres"
	_ "pupitre.studio/agent/internal/modules/db/redis"
)

type engine struct {
	id    string
	dump  func(*modules.Context, string) (string, int64, error)
	load  func(*modules.Context, string) ([]string, error)
	shell func(*modules.Context, string) (string, error)
	url   func(*modules.Context, string) (string, error)
}

var engines = map[string]engine{
	"mysql":    {mysql.ID, mysql.Dump, mysql.Import, mysql.Shell, mysql.URL},
	"postgres": {postgres.ID, postgres.Dump, postgres.Import, postgres.Shell, postgres.URL},
	"mongodb":  {mongodb.ID, mongodb.Dump, mongodb.Import, mongodb.Shell, mongodb.URL},
}
