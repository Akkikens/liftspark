// Build switches for features Liftspark keeps from openGym but doesn't show yet.
// The AI Coach needs openGym's server or the user's own model key; hidden unless VITE_LS_COACH=1.
export const COACH = (import.meta.env?.VITE_LS_COACH ?? '') === '1'
