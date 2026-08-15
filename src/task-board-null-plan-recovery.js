export function seedCatalogPlan(data, requestUrl) {
  if (!data || typeof data !== "object" || data.plan || !data.character) return data;
  const url = new URL(requestUrl);
  const minutes = Math.max(5, Number(data.preferences?.available_minutes) || 60);
  return {
    ...data,
    plan: {
      selected_mode: String(url.searchParams.get("planner_mode") || "efficient"),
      remaining_minutes: minutes,
      methods: [],
      now: null,
      next: null,
      session_complete: false,
      planner_kind: "task-board-day-boundary-seed-v1"
    }
  };
}
