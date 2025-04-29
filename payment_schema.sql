-- Create a table to store user payment account info (Stripe Connect)
CREATE TABLE IF NOT EXISTS user_payment_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_account_id TEXT,
    is_onboarded BOOLEAN DEFAULT FALSE,
    onboarding_complete_date TIMESTAMP WITH TIME ZONE,
    account_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create a table to store shipping configurations
CREATE TABLE IF NOT EXISTS shipping_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    claim_id UUID REFERENCES item_claims(id) ON DELETE CASCADE,
    default_shipping_fee INTEGER NOT NULL, -- in cents
    allow_claimer_custom BOOLEAN DEFAULT TRUE,
    min_shipping_fee INTEGER NOT NULL, -- in cents
    max_shipping_fee INTEGER NOT NULL, -- in cents
    allow_tipping BOOLEAN DEFAULT TRUE,
    shipping_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create a table to store payments for items
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES item_claims(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES auth.users(id),
    recipient_id UUID NOT NULL REFERENCES auth.users(id),
    amount INTEGER NOT NULL, -- amount in cents
    shipping_fee INTEGER NOT NULL, -- shipping fee in cents
    tip_amount INTEGER DEFAULT 0, -- optional tip in cents
    platform_fee INTEGER NOT NULL, -- platform fee in cents (10% of total)
    status TEXT NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    shipping_address JSONB
);

-- Create a table to store shipping details
CREATE TABLE IF NOT EXISTS shipping_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'US',
    tracking_number TEXT,
    shipping_provider TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'shipped', 'delivered'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add RLS policies
ALTER TABLE user_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_configs ENABLE ROW LEVEL SECURITY;

-- User can only see and modify their own payment account
CREATE POLICY user_payment_accounts_policy ON user_payment_accounts
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can see payments they're involved in (as payer or recipient)
CREATE POLICY payments_select_policy ON payments
    USING (payer_id = auth.uid() OR recipient_id = auth.uid());

-- Only the payer can create a payment
CREATE POLICY payments_insert_policy ON payments
    WITH CHECK (payer_id = auth.uid());

-- Both parties can see shipping details for their payments
CREATE POLICY shipping_select_policy ON shipping_details
    USING (
        payment_id IN (
            SELECT id FROM payments 
            WHERE payer_id = auth.uid() OR recipient_id = auth.uid()
        )
    );

-- Users can see their own shipping configurations
CREATE POLICY shipping_configs_select_policy ON shipping_configs
    USING (user_id = auth.uid() OR 
           item_id IN (SELECT id FROM items WHERE user_id = auth.uid()) OR
           claim_id IN (SELECT id FROM item_claims WHERE user_id = auth.uid())
    );

-- Users can create their own shipping configurations
CREATE POLICY shipping_configs_insert_policy ON shipping_configs
    WITH CHECK (user_id = auth.uid());

-- Users can update their own shipping configurations
CREATE POLICY shipping_configs_update_policy ON shipping_configs
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
CREATE TRIGGER update_user_payment_accounts_updated_at
    BEFORE UPDATE ON user_payment_accounts
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_shipping_details_updated_at
    BEFORE UPDATE ON shipping_details
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_shipping_configs_updated_at
    BEFORE UPDATE ON shipping_configs
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();