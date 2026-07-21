import { createApiClient } from '../../core/apiClient.js';

export const { startSession, submitScore, fetchLeaderboard } = createApiClient('mole');
