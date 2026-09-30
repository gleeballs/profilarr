import { assertEquals } from '@std/assert';
import { BaseTest } from '../base/BaseTest.ts';
import { summarizeEpisodeScores } from '$utils/arr/episodeScores.ts';
import type { SonarrEpisodeFile } from '$utils/arr/types.ts';

function file(id: number, customFormatScore: number): SonarrEpisodeFile {
	return {
		id,
		seriesId: 1,
		seasonNumber: 1,
		size: 1_000,
		quality: { quality: { id: 1, name: 'WEBDL-1080p' } },
		customFormats: [],
		customFormatScore,
		qualityCutoffNotMet: false
	};
}

class EpisodeScoresTest extends BaseTest {
	runTests(): void {
		this.test('totals scores against cutoff times episode count', () => {
			const summary = summarizeEpisodeScores([file(1, 800), file(2, 1000), file(3, 1300)], 1000);

			assertEquals(summary, {
				scoredEpisodeCount: 3,
				totalScore: 3100,
				targetScore: 3000,
				cutoffScore: 1000,
				averageScore: 1033,
				lowestScore: 800,
				episodesMeetingCutoff: 2,
				progress: 3100 / 3000,
				cutoffMet: false
			});
		});

		this.test('marks cutoff met only when every episode reaches it', () => {
			const summary = summarizeEpisodeScores([file(1, 1000), file(2, 1500)], 1000);

			assertEquals(summary.cutoffMet, true);
			assertEquals(summary.episodesMeetingCutoff, 2);
		});

		this.test('handles negative scores', () => {
			const summary = summarizeEpisodeScores([file(1, -500), file(2, 250)], 1000);

			assertEquals(summary.totalScore, -250);
			assertEquals(summary.lowestScore, -500);
			assertEquals(summary.progress, -250 / 2000);
			assertEquals(summary.cutoffMet, false);
		});

		this.test('returns zero progress when the profile has no cutoff score', () => {
			const summary = summarizeEpisodeScores([file(1, 0), file(2, 0)], 0);

			assertEquals(summary.targetScore, 0);
			assertEquals(summary.progress, 0);
			assertEquals(summary.cutoffMet, true);
		});

		this.test('returns an empty summary when there are no files', () => {
			const summary = summarizeEpisodeScores([], 1000);

			assertEquals(summary.scoredEpisodeCount, 0);
			assertEquals(summary.totalScore, 0);
			assertEquals(summary.targetScore, 0);
			assertEquals(summary.lowestScore, null);
			assertEquals(summary.cutoffMet, false);
		});
	}
}

const episodeScoresTest = new EpisodeScoresTest();
episodeScoresTest.runTests();
