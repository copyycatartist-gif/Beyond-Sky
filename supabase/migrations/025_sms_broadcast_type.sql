-- Migration 025: Add 'broadcast' SMS message type for group-wide SMS broadcasts

ALTER TYPE public.sms_message_type ADD VALUE IF NOT EXISTS 'broadcast';
