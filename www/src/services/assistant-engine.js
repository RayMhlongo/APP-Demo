import {
  assistantReply,
  buildInsights,
  businessDayCoverage,
  businessRecommendations,
  reasonDistribution,
  todaySales,
  weekSales,
  weekdayPerformance
} from './analytics.js';

function providerDefaults(provider) {
  if (provider === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.1-8b-instant'
    };
  }
  if (provider === 'openrouter') {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'meta-llama/llama-3.1-8b-instruct:free'
    };
  }
  return { url: '', model: '' };
}

function summarizeState(state) {
  const today = todaySales(state);
  const week = weekSales(state);
  const coverage = businessDayCoverage(state);
  const reasons = reasonDistribution(state);
  const insights = buildInsights(state).slice(0, 5);
  const recommendations = businessRecommendations(state).slice(0, 3);
  const weekdays = weekdayPerformance(state).map((day) => ({
    day: day.fullLabel,
    total: day.total,
    saleEntries: day.saleEntries,
    saleDays: day.saleDays,
    noSaleEntries: day.noSaleEntries,
    topReason: day.topReason ? day.topReason[0] : ''
  }));
  return {
    todaySalesTotal: today.total,
    todayTx: today.entries.length,
    weekSalesTotal: week.total,
    weekTx: week.entries.length,
    noSaleLogs: state.entries.filter((entry) => entry.type === 'no_sale').length,
    noSaleReasonDistribution: reasons,
    operatingCoverage: coverage,
    customerCount: state.customers.length,
    walletCount: state.wallets.length,
    topInsights: insights,
    recommendedActions: recommendations,
    weekdayPerformance: weekdays
  };
}

export function createAssistantEngine({ getState, telemetry }) {
  async function askLocal(question) {
    const state = getState();
    return {
      ok: true,
      mode: 'local',
      text: assistantReply(question, state)
    };
  }

  async function askRemote(question) {
    const state = getState();
    const cfg = state.settings.assistant || {};
    const provider = cfg.provider || 'none';
    const apiKey = String(cfg.apiKey || '').trim();
    if (provider === 'none' || !apiKey) return askLocal(question);

    const defaults = providerDefaults(provider);
    const baseUrl = String(cfg.baseUrl || defaults.url || '').trim();
    const model = String(cfg.model || defaults.model || '').trim();
    if (!baseUrl || !model) return askLocal(question);

    const summary = summarizeState(state);
    const systemPrompt = [
      'You are a practical business assistant for Cathdel Creamy (ice-cream vendor).',
      'Use only the given app data summary. Do not invent numbers.',
      'Keep answers concise, actionable, and owner-friendly.',
      'If the user asks for advice, combine the data with practical small-business suggestions.',
      'When uncertain, say what data is missing.'
    ].join(' ');

    const userPrompt = [
      `Question: ${String(question || '').trim()}`,
      `Data summary: ${JSON.stringify(summary)}`
    ].join('\n');

    try {
      telemetry.track('assistant_remote_request', { provider, model });
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      };
      if (provider === 'openrouter') headers['HTTP-Referer'] = window.location.origin;

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI request failed (${response.status}): ${text.slice(0, 180)}`);
      }

      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content || '';
      if (!String(text).trim()) throw new Error('AI response was empty.');

      return {
        ok: true,
        mode: provider,
        text: String(text).trim()
      };
    } catch (error) {
      telemetry.track('assistant_remote_failed', {
        provider,
        message: error.message || 'unknown'
      });
      telemetry.captureError(error, { area: 'assistant_remote' });
      const fallback = await askLocal(question);
      return {
        ...fallback,
        mode: 'local_fallback',
        note: 'AI was unavailable, local insight used.'
      };
    }
  }

  return {
    ask: askRemote
  };
}
