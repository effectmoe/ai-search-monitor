-- AI Search Monitor Database Schema
-- SQLite3 Database

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    brand_names TEXT NOT NULL, -- JSON array
    competitor_names TEXT, -- JSON array
    keywords TEXT NOT NULL, -- JSON array
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Monitoring sessions table
CREATE TABLE IF NOT EXISTS monitoring_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    status TEXT CHECK(status IN ('running', 'completed', 'failed', 'partial')) DEFAULT 'running',
    total_clients INTEGER,
    total_platforms INTEGER,
    successful_scrapes INTEGER DEFAULT 0,
    failed_scrapes INTEGER DEFAULT 0,
    metadata TEXT -- JSON object
);

-- Scraping results table
CREATE TABLE IF NOT EXISTS scraping_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai')),
    keyword TEXT NOT NULL,
    response_text TEXT,
    response_length INTEGER,
    screenshot_path TEXT,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT 0,
    error_message TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES monitoring_sessions(session_id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Brand mentions table
CREATE TABLE IF NOT EXISTS brand_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    brand_name TEXT NOT NULL,
    mention_count INTEGER DEFAULT 0,
    positions TEXT, -- JSON array of positions
    contexts TEXT, -- JSON array of context strings
    sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative')),
    strength REAL DEFAULT 0.5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES scraping_results(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Competitor mentions table
CREATE TABLE IF NOT EXISTS competitor_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    competitor_name TEXT NOT NULL,
    mention_count INTEGER DEFAULT 0,
    positions TEXT, -- JSON array
    comparison_context TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES scraping_results(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Sentiment analysis table
CREATE TABLE IF NOT EXISTS sentiment_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    overall_sentiment TEXT CHECK(overall_sentiment IN ('positive', 'neutral', 'negative')),
    sentiment_score REAL,
    positive_ratio REAL,
    neutral_ratio REAL,
    negative_ratio REAL,
    confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES scraping_results(id)
);

-- Position analysis table
CREATE TABLE IF NOT EXISTS position_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    average_position REAL,
    first_mention_position INTEGER,
    last_mention_position INTEGER,
    relative_position TEXT CHECK(relative_position IN ('beginning', 'early', 'middle', 'late', 'end')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES scraping_results(id)
);

-- Visibility scores table
CREATE TABLE IF NOT EXISTS visibility_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    total_score REAL,
    mention_score REAL,
    position_score REAL,
    sentiment_score REAL,
    competitor_comparison_score REAL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES scraping_results(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    recommendation_text TEXT NOT NULL,
    priority TEXT CHECK(priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
    category TEXT CHECK(category IN ('visibility', 'positioning', 'sentiment', 'competition', 'critical')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES scraping_results(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Daily aggregated metrics table (for reporting)
CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date DATE NOT NULL,
    platform TEXT NOT NULL,
    total_searches INTEGER DEFAULT 0,
    successful_searches INTEGER DEFAULT 0,
    failed_searches INTEGER DEFAULT 0,
    average_visibility_score REAL,
    average_sentiment_score REAL,
    total_brand_mentions INTEGER DEFAULT 0,
    total_competitor_mentions INTEGER DEFAULT 0,
    UNIQUE(client_id, date, platform),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    client_id INTEGER,
    platform TEXT,
    error_type TEXT,
    error_message TEXT,
    stack_trace TEXT,
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT 0,
    resolution_notes TEXT
);

-- Platform status table (for circuit breaker tracking)
CREATE TABLE IF NOT EXISTS platform_status (
    platform TEXT PRIMARY KEY,
    is_available BOOLEAN DEFAULT 1,
    last_success_at DATETIME,
    last_failure_at DATETIME,
    failure_count INTEGER DEFAULT 0,
    circuit_breaker_state TEXT CHECK(circuit_breaker_state IN ('closed', 'open', 'half-open')) DEFAULT 'closed',
    next_retry_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scraping_results_session ON scraping_results(session_id);
CREATE INDEX IF NOT EXISTS idx_scraping_results_client ON scraping_results(client_id);
CREATE INDEX IF NOT EXISTS idx_scraping_results_platform ON scraping_results(platform);
CREATE INDEX IF NOT EXISTS idx_scraping_results_scraped_at ON scraping_results(scraped_at);
CREATE INDEX IF NOT EXISTS idx_brand_mentions_client ON brand_mentions(client_id);
CREATE INDEX IF NOT EXISTS idx_brand_mentions_result ON brand_mentions(result_id);
CREATE INDEX IF NOT EXISTS idx_visibility_scores_client ON visibility_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_client_date ON daily_metrics(client_id, date);
CREATE INDEX IF NOT EXISTS idx_error_logs_session ON error_logs(session_id);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_clients_timestamp 
AFTER UPDATE ON clients
BEGIN
    UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_platform_status_timestamp 
AFTER UPDATE ON platform_status
BEGIN
    UPDATE platform_status SET updated_at = CURRENT_TIMESTAMP WHERE platform = NEW.platform;
END;