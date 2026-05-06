
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'qualified';
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'not_qualified';
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'meeting_booked';
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'started';
