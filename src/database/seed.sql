-- Seed data for AI Search Monitor
-- Insert sample clients for testing

-- Insert sample clients
INSERT OR IGNORE INTO clients (name, description, brand_names, competitor_names, keywords, is_active) VALUES
('Tech Startup Alpha', 'AI-powered productivity software company', 
 '["Alpha AI", "AlphaTools", "Alpha Productivity"]', 
 '["Notion", "Monday.com", "Asana"]',
 '["productivity software", "AI tools", "task management", "workflow automation"]', 1),

('E-commerce Beta', 'Online fashion retailer with sustainable focus',
 '["Beta Fashion", "EcoBeta", "Beta Style"]',
 '["Zara", "H&M", "Uniqlo", "Patagonia"]',
 '["sustainable fashion", "online clothing", "eco-friendly apparel", "fashion trends"]', 1),

('Healthcare Gamma', 'Digital health platform for remote patient monitoring',
 '["Gamma Health", "TeleGamma", "Gamma Care"]',
 '["Teladoc", "Amwell", "MDLive"]',
 '["telemedicine", "remote patient monitoring", "digital health", "virtual care"]', 1),

('FinTech Delta', 'Cryptocurrency trading platform and wallet',
 '["DeltaPay", "Delta Exchange", "Delta Wallet"]',
 '["Coinbase", "Binance", "Kraken", "PayPal"]',
 '["cryptocurrency", "crypto trading", "digital wallet", "blockchain"]', 1),

('EdTech Epsilon', 'Online learning platform for professional development',
 '["Epsilon Learn", "EpsilonEd", "Epsilon Academy"]',
 '["Coursera", "Udemy", "LinkedIn Learning", "Pluralsight"]',
 '["online learning", "professional development", "skill training", "e-learning"]', 1);

-- Initialize platform status
INSERT OR IGNORE INTO platform_status (platform, is_available, circuit_breaker_state) VALUES
('chatgpt', 1, 'closed'),
('perplexity', 1, 'closed'),
('gemini', 1, 'closed'),
('claude', 1, 'closed'),
('google-ai', 1, 'closed');