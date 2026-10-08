-- Ledger and portfolio views must run as the querying user so RLS on
-- clients, loans, transactions, and repayment_schedule applies.

ALTER VIEW public.client_ledger_summary SET (security_invoker = true);
ALTER VIEW public.portfolio_summary SET (security_invoker = true);
ALTER VIEW public.par_report SET (security_invoker = true);
ALTER VIEW public.weekly_collection_performance SET (security_invoker = true);
ALTER VIEW public.overdue_clients SET (security_invoker = true);

REVOKE ALL ON public.client_ledger_summary FROM anon;
REVOKE ALL ON public.portfolio_summary FROM anon;
REVOKE ALL ON public.par_report FROM anon;
REVOKE ALL ON public.weekly_collection_performance FROM anon;
REVOKE ALL ON public.overdue_clients FROM anon;

GRANT SELECT ON public.client_ledger_summary TO authenticated;
GRANT SELECT ON public.portfolio_summary TO authenticated;
GRANT SELECT ON public.par_report TO authenticated;
GRANT SELECT ON public.weekly_collection_performance TO authenticated;
GRANT SELECT ON public.overdue_clients TO authenticated;
