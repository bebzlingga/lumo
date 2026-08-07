import { journalPhotoUri } from '../journalPhotos'

/**
 * The bug this guards: an entry used to persist the absolute URI its photo was
 * copied to, container UUID and all. iOS mints a new container on every
 * install — every dev-client rebuild, every store update — so the file moved
 * with it and the stored path stopped resolving. Attachments went blank on the
 * next launch.
 */
const LEGACY_CONTAINER = 'file:///var/mobile/Containers/Data/Application/OLD-UUID-1111/Documents/journal-photos/'

describe('journalPhotoUri', () => {
	it('is undefined when there is no attachment', () => {
		expect(journalPhotoUri()).toBeUndefined()
		expect(journalPhotoUri('')).toBeUndefined()
	})

	it('resolves a stored filename to a path ending in that file', () => {
		expect(journalPhotoUri('2026-08-06-1754.jpg')).toMatch(/journal-photos\/2026-08-06-1754\.jpg$/)
	})

	it('recovers a legacy absolute URI by its filename', () => {
		const resolved = journalPhotoUri(`${LEGACY_CONTAINER}2026-08-06-1754.jpg`)

		expect(resolved).toMatch(/journal-photos\/2026-08-06-1754\.jpg$/)
		// The whole point — the dead container is not carried through.
		expect(resolved).not.toContain('OLD-UUID-1111')
	})

	it('never returns a path with the folder repeated', () => {
		const resolved = journalPhotoUri(`${LEGACY_CONTAINER}2026-08-06-1754.jpg`) ?? ''

		expect(resolved.match(/journal-photos/g)).toHaveLength(1)
	})

	it('drops a query string picked up from the source uri', () => {
		expect(journalPhotoUri('2026-08-06-1754.jpg?width=100')).toMatch(/2026-08-06-1754\.jpg$/)
	})

	it('resolves the same stored value to the same uri every time', () => {
		expect(journalPhotoUri('a.jpg')).toBe(journalPhotoUri('a.jpg'))
	})
})
