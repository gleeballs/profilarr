import { assertEquals } from '@std/assert';
import { BaseTest } from '../base/BaseTest.ts';
import { SonarrClient } from '$utils/arr/clients/sonarr.ts';
import type { ArrQualityProfile, SonarrEpisodeFile, SonarrSeries } from '$utils/arr/types.ts';

class MockSonarrClient extends SonarrClient {
	readonly episodeFileRequests: number[] = [];

	constructor(
		private readonly series: SonarrSeries[],
		private readonly profiles: ArrQualityProfile[],
		private readonly episodeFiles: Map<number, SonarrEpisodeFile[] | Error> = new Map()
	) {
		super('http://sonarr.local', 'test-api-key');
	}

	override getAllSeries(): Promise<SonarrSeries[]> {
		return Promise.resolve(this.series);
	}

	override getQualityProfiles(): Promise<ArrQualityProfile[]> {
		return Promise.resolve(this.profiles);
	}

	override getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
		this.episodeFileRequests.push(seriesId);
		const files = this.episodeFiles.get(seriesId) ?? [];
		return files instanceof Error ? Promise.reject(files) : Promise.resolve(files);
	}
}

function createProfile(id: number, cutoffFormatScore: number): ArrQualityProfile {
	return {
		id,
		name: `Profile ${id}`,
		upgradeAllowed: true,
		cutoff: 1,
		items: [],
		minFormatScore: 0,
		cutoffFormatScore,
		formatItems: []
	};
}

function createSeries(id: number, seasonFileCounts: number[]): SonarrSeries {
	const seasons = seasonFileCounts.map((fileCount, index) => ({
		seasonNumber: index + 1,
		monitored: true,
		statistics: {
			episodeCount: fileCount,
			episodeFileCount: fileCount,
			totalEpisodeCount: fileCount,
			sizeOnDisk: fileCount * 1_000,
			releaseGroups: [],
			percentOfEpisodes: fileCount > 0 ? 100 : 0
		}
	}));
	const episodeFileCount = seasonFileCounts.reduce((total, count) => total + count, 0);

	return {
		id,
		title: `Series ${id}`,
		qualityProfileId: 10,
		monitored: true,
		seasons,
		statistics: {
			seasonCount: seasons.length,
			episodeFileCount,
			episodeCount: episodeFileCount,
			totalEpisodeCount: episodeFileCount,
			sizeOnDisk: episodeFileCount * 1_000,
			percentOfEpisodes: episodeFileCount > 0 ? 100 : 0
		}
	};
}

function createEpisodeFile(
	id: number,
	seriesId: number,
	seasonNumber: number,
	customFormatScore: number
): SonarrEpisodeFile {
	return {
		id,
		seriesId,
		seasonNumber,
		size: 1_000,
		quality: { quality: { id: 1, name: 'WEBDL-1080p' } },
		customFormats: [],
		customFormatScore,
		qualityCutoffNotMet: false
	};
}

class SonarrClientTest extends BaseTest {
	runTests(): void {
		this.test('maps seasons with missing statistics to zero values', async () => {
			const client = new MockSonarrClient(
				[
					{
						id: 1,
						title: 'Whatbox Show',
						qualityProfileId: 10,
						monitored: true,
						seasons: [
							{
								seasonNumber: 1,
								monitored: true
							},
							{
								seasonNumber: 2,
								monitored: true,
								statistics: {
									episodeCount: 8,
									episodeFileCount: 7,
									totalEpisodeCount: 8,
									sizeOnDisk: 1234,
									releaseGroups: [],
									percentOfEpisodes: 87.5
								}
							}
						]
					}
				],
				[
					{
						id: 10,
						name: 'HD',
						upgradeAllowed: true,
						cutoff: 1,
						items: [],
						minFormatScore: 0,
						cutoffFormatScore: 0,
						formatItems: []
					}
				]
			);

			try {
				const library = await client.getLibrary(new Set(['HD']));

				assertEquals(library[0].qualityProfileName, 'HD');
				assertEquals(library[0].isProfilarrProfile, true);
				assertEquals(library[0].seasons[0], {
					seasonNumber: 1,
					monitored: true,
					episodeCount: 0,
					episodeFileCount: 0,
					totalEpisodeCount: 0,
					sizeOnDisk: 0,
					percentOfEpisodes: 0,
					score: {
						scoredEpisodeCount: 0,
						totalScore: 0,
						targetScore: 0,
						cutoffScore: 0,
						averageScore: 0,
						lowestScore: null,
						episodesMeetingCutoff: 0,
						progress: 0,
						cutoffMet: false
					}
				});
				assertEquals(library[0].seasons[1].episodeCount, 8);
			} finally {
				client.close();
			}
		});

		this.test('aggregates episode file scores per series and per season', async () => {
			const client = new MockSonarrClient(
				[createSeries(1, [2, 1])],
				[createProfile(10, 1000)],
				new Map([
					[
						1,
						[
							createEpisodeFile(1, 1, 1, 1000),
							createEpisodeFile(2, 1, 1, 500),
							createEpisodeFile(3, 1, 2, 1200)
						]
					]
				])
			);

			try {
				const [series] = await client.getLibrary();

				assertEquals(series.score?.scoredEpisodeCount, 3);
				assertEquals(series.score?.totalScore, 2700);
				assertEquals(series.score?.targetScore, 3000);
				assertEquals(series.score?.progress, 0.9);
				assertEquals(series.score?.lowestScore, 500);
				assertEquals(series.score?.episodesMeetingCutoff, 2);
				assertEquals(series.score?.cutoffMet, false);

				assertEquals(series.seasons[0].score?.totalScore, 1500);
				assertEquals(series.seasons[0].score?.targetScore, 2000);
				assertEquals(series.seasons[0].score?.cutoffMet, false);
				assertEquals(series.seasons[1].score?.totalScore, 1200);
				assertEquals(series.seasons[1].score?.cutoffMet, true);
			} finally {
				client.close();
			}
		});

		this.test('skips episode file requests for series without files', async () => {
			const client = new MockSonarrClient(
				[createSeries(1, [0]), createSeries(2, [1])],
				[createProfile(10, 100)],
				new Map([[2, [createEpisodeFile(1, 2, 1, 100)]]])
			);

			try {
				const library = await client.getLibrary();

				assertEquals(client.episodeFileRequests, [2]);
				assertEquals(library[0].score?.scoredEpisodeCount, 0);
				assertEquals(library[1].score?.cutoffMet, true);
			} finally {
				client.close();
			}
		});

		this.test('leaves score empty when a series episode file request fails', async () => {
			const client = new MockSonarrClient(
				[createSeries(1, [1]), createSeries(2, [1])],
				[createProfile(10, 100)],
				new Map<number, SonarrEpisodeFile[] | Error>([
					[1, new Error('boom')],
					[2, [createEpisodeFile(1, 2, 1, 50)]]
				])
			);

			try {
				const library = await client.getLibrary();

				assertEquals(library[0].score, null);
				assertEquals(library[0].seasons[0].score, null);
				assertEquals(library[1].score?.totalScore, 50);
				assertEquals(library[1].score?.progress, 0.5);
			} finally {
				client.close();
			}
		});
	}
}

const sonarrClientTest = new SonarrClientTest();
sonarrClientTest.runTests();
