import { defaultSettings, loadSettings as load } from '@aspid-lingo/browser/settings';

export { saveSettings } from '@aspid-lingo/browser/settings';

/** Parts of a page that can be translated; options.html has a switch for each, with `data-part` set to its key. */
export const PARTS = ['prTitle', 'prBody', 'comments', 'reviewComments', 'commitTitles', 'commitBodies', 'readme'];

export const DEFAULT_SETTINGS = defaultSettings(PARTS);

export const loadSettings = () => load(DEFAULT_SETTINGS);
