package db

import (
	"pupitre.studio/agent/internal/modules"
	_ "pupitre.studio/agent/internal/modules/db/mailpit"
	"pupitre.studio/agent/internal/modules/db/mongodb"
	"pupitre.studio/agent/internal/modules/db/mysql"
	"pupitre.studio/agent/internal/modules/db/postgres"
	"pupitre.studio/agent/internal/modules/db/query"
	"pupitre.studio/agent/internal/modules/db/redis"
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

type querier struct {
	id    string
	query func(*modules.Context, string, string) (query.Result, error)
}

var queriers = map[string]querier{
	"mysql":    {mysql.ID, mysql.Query},
	"postgres": {postgres.ID, postgres.Query},
	"mongodb":  {mongodb.ID, mongodb.Query},
	"redis":    {redis.ID, redis.Query},
}
