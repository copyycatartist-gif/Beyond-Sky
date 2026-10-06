-- Add SMS message types for client onboarding and loan payoff notices.

ALTER TYPE public.sms_message_type ADD VALUE IF NOT EXISTS 'welcome';
ALTER TYPE public.sms_message_type ADD VALUE IF NOT EXISTS 'loan_closed';
