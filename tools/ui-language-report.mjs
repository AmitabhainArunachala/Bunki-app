/** Where the UI-language tour writes its report inside one evidence directory. */
import path from 'node:path';

export const uiLanguageReportPath = (evidence) => path.join(evidence, 'ui-language', 'report.json');
