import type { SonarrEpisodeFile, SonarrScoreSummary } from './types.ts';

/**
 * Aggregate custom format scores across a set of episode files.
 *
 * Sonarr scores each episode file on its own, so a series (or season) has no
 * single score. The summary totals every file's score and measures it against
 * the total the files would reach if each one sat at the profile's cutoff.
 * Because one high-scoring file can offset a low one in the total, the summary
 * also tracks the lowest score and how many files reached the cutoff.
 */
export function summarizeEpisodeScores(
	files: SonarrEpisodeFile[],
	cutoffScore: number
): SonarrScoreSummary {
	let totalScore = 0;
	let lowestScore: number | null = null;
	let episodesMeetingCutoff = 0;

	for (const file of files) {
		const score = file.customFormatScore ?? 0;
		totalScore += score;
		if (lowestScore === null || score < lowestScore) lowestScore = score;
		if (score >= cutoffScore) episodesMeetingCutoff += 1;
	}

	const scoredEpisodeCount = files.length;
	const targetScore = cutoffScore * scoredEpisodeCount;

	return {
		scoredEpisodeCount,
		totalScore,
		targetScore,
		cutoffScore,
		averageScore: scoredEpisodeCount > 0 ? Math.round(totalScore / scoredEpisodeCount) : 0,
		lowestScore,
		episodesMeetingCutoff,
		progress: targetScore > 0 ? totalScore / targetScore : 0,
		cutoffMet: scoredEpisodeCount > 0 && episodesMeetingCutoff === scoredEpisodeCount
	};
}
