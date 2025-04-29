-- Items Schema for IFound4U 
 
-- Enable UUID generation 
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; 
 
-- Create enum type for item status 
CREATE TYPE item_status AS ENUM ('pending', 'verified', 'claimed', 'resolved', 'expired'); 
 
-- Create enum type for item type 
CREATE TYPE item_type AS ENUM ('lost', 'found'); 

-- Create enum type for claim status
CREATE TYPE claim_status AS ENUM ('pending', 'accepted', 'rejected', 'resolved', 'paid', 'shipped', 'delivered');
 
-- Create table for items 
CREATE TABLE items ( 
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, 
  type item_type NOT NULL, 
  category VARCHAR(50) NOT NULL, 
  title VARCHAR(100) NOT NULL, 
  description TEXT NOT NULL, 
  date DATE NOT NULL, 
  location_address TEXT NOT NULL, 
  location_latitude DOUBLE PRECISION NOT NULL, 
  location_longitude DOUBLE PRECISION NOT NULL, 
  location_place_id VARCHAR(255), 
  image_url TEXT, 
  status item_status DEFAULT 'pending', 
  is_moderated BOOLEAN DEFAULT FALSE, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP 
);

-- Create table for contact information
CREATE TABLE contact_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for item claims
CREATE TABLE item_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimer_name VARCHAR(100) NOT NULL,
  claimer_email VARCHAR(255) NOT NULL,
  claimer_phone VARCHAR(50),
  claim_description TEXT NOT NULL,
  chat_room_id TEXT NOT NULL UNIQUE,
  status claim_status DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for verification codes
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create table for chat messages between item owners and claimers
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_room_id TEXT NOT NULL REFERENCES item_claims(chat_room_id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_email VARCHAR(255) NOT NULL,
  sender_name VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create stored procedure to create verification_codes table if it doesn't exist
CREATE OR REPLACE FUNCTION create_verification_table()
RETURNS void AS $$
BEGIN
  -- Check if the table already exists
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'verification_codes'
  ) THEN
    -- Create the table if it doesn't exist
    CREATE TABLE verification_codes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code TEXT NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    -- Create index for faster lookups
    CREATE INDEX idx_verification_codes_code ON verification_codes(code);
    CREATE INDEX idx_verification_codes_email ON verification_codes(email);
    CREATE INDEX idx_verification_codes_item_id ON verification_codes(item_id);
    CREATE INDEX idx_verification_codes_expires_at ON verification_codes(expires_at);
    
    -- Enable Row Level Security
    ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY "Service role can manage all verification codes" 
      ON verification_codes 
      FOR ALL 
      TO service_role 
      USING (true);
      
    CREATE POLICY "Authenticated users can only read their own verification codes" 
      ON verification_codes 
      FOR SELECT 
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM contact_info ci 
          JOIN items i ON ci.item_id = i.id
          WHERE ci.item_id = verification_codes.item_id 
          AND ci.email = verification_codes.email
          AND i.user_id = auth.uid()
        )
      );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create index for faster lookups
CREATE INDEX idx_contact_info_item_id ON contact_info(item_id);
CREATE INDEX idx_contact_info_email ON contact_info(email);
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_type ON items(type);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_item_claims_item_id ON item_claims(item_id);
CREATE INDEX idx_item_claims_user_id ON item_claims(user_id);
CREATE INDEX idx_item_claims_chat_room_id ON item_claims(chat_room_id);
CREATE INDEX idx_chat_messages_chat_room_id ON chat_messages(chat_room_id);
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Enable Row Level Security on verification_codes table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'verification_codes'
  ) THEN
    -- Enable Row Level Security
    ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY IF NOT EXISTS "Service role can manage all verification codes" 
      ON verification_codes 
      FOR ALL 
      TO service_role 
      USING (true);
      
    CREATE POLICY IF NOT EXISTS "Authenticated users can only read their own verification codes" 
      ON verification_codes 
      FOR SELECT 
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM contact_info ci 
          JOIN items i ON ci.item_id = i.id
          WHERE ci.item_id = verification_codes.item_id 
          AND ci.email = verification_codes.email
          AND i.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Enable Row Level Security on the items table
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Create policies for the items table
-- Allow everyone (including anonymous users) to read all items
CREATE POLICY "Anyone can view all items" 
  ON items 
  FOR SELECT 
  TO PUBLIC
  USING (true);

-- Only authenticated users can create new items
CREATE POLICY "Authenticated users can create items" 
  ON items 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Users can only update their own items
CREATE POLICY "Users can update their own items" 
  ON items 
  FOR UPDATE 
  TO authenticated 
  USING (user_id = auth.uid());

-- Users can only delete their own items
CREATE POLICY "Users can delete their own items" 
  ON items 
  FOR DELETE 
  TO authenticated 
  USING (user_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role has full access to items" 
  ON items 
  FOR ALL 
  TO service_role 
  USING (true);

-- Enable Row Level Security on contact_info table
ALTER TABLE contact_info ENABLE ROW LEVEL SECURITY;

-- Create policies for the contact_info table
-- Allow everyone to view contact info (but hide sensitive details via views if needed)
CREATE POLICY "Anyone can view basic contact info" 
  ON contact_info 
  FOR SELECT 
  TO PUBLIC
  USING (true);

-- Only authenticated users can create contact info
CREATE POLICY "Authenticated users can create contact info" 
  ON contact_info 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Users can only update their own contact info
CREATE POLICY "Users can update their own contact info" 
  ON contact_info 
  FOR UPDATE 
  TO authenticated 
  USING (user_id = auth.uid() OR 
         EXISTS (
           SELECT 1 FROM items i 
           WHERE i.id = item_id AND i.user_id = auth.uid()
         ));

-- Service role has full access to contact info
CREATE POLICY "Service role has full access to contact info" 
  ON contact_info 
  FOR ALL 
  TO service_role 
  USING (true);

-- Enable Row Level Security on the item_claims table
ALTER TABLE item_claims ENABLE ROW LEVEL SECURITY;

-- Create policies for the item_claims table
-- Allow authenticated users to create claims
CREATE POLICY "Users can create item claims" 
  ON item_claims 
  FOR INSERT 
  TO PUBLIC
  WITH CHECK (true);

-- Item owners can view claims on their items
CREATE POLICY "Item owners can view claims on their items" 
  ON item_claims 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM items i
      WHERE i.id = item_id AND i.user_id = auth.uid()
    )
  );

-- Claimers can view their own claims
CREATE POLICY "Claimers can view their own claims" 
  ON item_claims 
  FOR SELECT 
  TO PUBLIC
  USING (
    user_id = auth.uid() OR
    claimer_email = coalesce(nullif(current_setting('request.jwt.claims', true)::json->>'email', ''), 'anonymous')
  );

-- Item owners can update claim status
CREATE POLICY "Item owners can update claim status" 
  ON item_claims 
  FOR UPDATE
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM items i
      WHERE i.id = item_id AND i.user_id = auth.uid()
    )
  );

-- Service role has full access to item claims
CREATE POLICY "Service role has full access to item claims" 
  ON item_claims 
  FOR ALL 
  TO service_role 
  USING (true);

-- Enable Row Level Security on the chat_messages table
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for the chat_messages table
-- Participants can view messages in their chat rooms
CREATE POLICY "Chat participants can view messages" 
  ON chat_messages 
  FOR SELECT 
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM item_claims ic
      JOIN items i ON ic.item_id = i.id
      WHERE ic.chat_room_id = chat_messages.chat_room_id AND 
      (
        -- Item owner
        i.user_id = auth.uid() OR
        -- Claimer
        ic.user_id = auth.uid() OR
        -- Match by email for non-authenticated users
        ic.claimer_email = coalesce(nullif(current_setting('request.jwt.claims', true)::json->>'email', ''), 'anonymous')
      )
    )
  );

-- Participants can send messages in their chat rooms
CREATE POLICY "Chat participants can send messages" 
  ON chat_messages 
  FOR INSERT 
  TO PUBLIC
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM item_claims ic
      JOIN items i ON ic.item_id = i.id
      WHERE ic.chat_room_id = chat_messages.chat_room_id AND 
      (
        -- Item owner
        i.user_id = auth.uid() OR
        -- Claimer
        ic.user_id = auth.uid() OR
        -- Match by email for non-authenticated users
        ic.claimer_email = coalesce(nullif(current_setting('request.jwt.claims', true)::json->>'email', ''), 'anonymous')
      )
    )
  );

-- Participants can update read status of messages
CREATE POLICY "Chat participants can update read status" 
  ON chat_messages 
  FOR UPDATE
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM item_claims ic
      JOIN items i ON ic.item_id = i.id
      WHERE ic.chat_room_id = chat_messages.chat_room_id AND 
      (
        -- Item owner
        i.user_id = auth.uid() OR
        -- Claimer 
        ic.user_id = auth.uid() OR
        -- Match by email for non-authenticated users
        ic.claimer_email = coalesce(nullif(current_setting('request.jwt.claims', true)::json->>'email', ''), 'anonymous')
      )
    )
  );

-- Service role has full access to chat messages
CREATE POLICY "Service role has full access to chat messages" 
  ON chat_messages 
  FOR ALL 
  TO service_role 
  USING (true);
