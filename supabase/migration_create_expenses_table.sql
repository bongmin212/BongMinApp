-- Drop and recreate expenses table with correct schema
DROP TABLE IF EXISTS expenses CASCADE;

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT NOT NULL,
    date DATE NOT NULL,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on code for faster lookups
CREATE INDEX IF NOT EXISTS idx_expenses_code ON expenses(code);

-- Create index on date for filtering
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- Create index on type for filtering
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);

-- Enable RLS (Row Level Security)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON expenses
    FOR ALL USING (auth.role() = 'authenticated');

-- Create policy to allow all operations for service role
CREATE POLICY "Allow all operations for service role" ON expenses
    FOR ALL USING (auth.role() = 'service_role');
