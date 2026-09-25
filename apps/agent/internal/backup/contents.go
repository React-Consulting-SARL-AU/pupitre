package backup

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
)

// An engine that does not answer is named as unreadable rather than failing the list.
func (s *Service) Contents() (contract.BackupContentsResult, error) {
	result := contract.BackupContentsResult{Projects: []contract.BackupContentProject{}, Databases: []contract.BackupContentDatabase{}, Unreadable: []string{}}

	err := s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		settings := module.Read(ctx)

		declared, err := s.options.Reader.Declared()
		if err != nil {
			return err
		}

		for _, project := range declared {
			included := settings.Projects != module.ProjectsNone && !settings.LeavesOutProject(project.Name)
			result.Projects = append(result.Projects, contract.BackupContentProject{Name: project.Name, Repo: project.Repo != "", Included: included})
		}

		for _, held := range s.holdings(ctx) {
			if held.err != nil {
				result.Unreadable = append(result.Unreadable, held.engine.name)

				continue
			}

			for _, item := range held.items() {
				item.Included = settings.Databases && !settings.LeavesOutDatabase(item.Item)
				result.Databases = append(result.Databases, item)
			}
		}

		return nil
	})

	return result, err
}
