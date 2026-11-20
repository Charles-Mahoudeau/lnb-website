import { peopleListService } from './people/list';
import { peopleSummaryService } from './people/summary';

export { peopleAccess } from './people/access';

/** The People list and the Person page's summary (docs/plans/admin-redesign.md, slice 2). */
export const peopleService = {
  list: peopleListService.list,
  summary: peopleSummaryService.summary,
};
