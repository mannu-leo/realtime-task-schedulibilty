-- ==============================================================
-- REAL-TIME TASK SCHEDULABILITY ANALYSER DATABASE SCHEMA
-- Compatible with MySQL 5.7+ and MySQL 8.0 / 8.4+
-- ==============================================================

CREATE DATABASE IF NOT EXISTS realtime_scheduler
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE realtime_scheduler;

-- Drop tables in reverse dependency order for clean migrations if needed
DROP TABLE IF EXISTS simulation_results;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS simulations;

-- 1. Simulations metadata table
CREATE TABLE simulations (
    simulation_id INT AUTO_INCREMENT PRIMARY KEY,
    algorithm VARCHAR(30) NOT NULL,
    cpu_utilization DECIMAL(6, 2) NOT NULL,
    schedulability_status VARCHAR(50) NOT NULL,
    deadline_misses INT NOT NULL DEFAULT 0,
    simulation_horizon INT NOT NULL DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Tasks table (Periodic task specifications)
CREATE TABLE tasks (
    task_id INT AUTO_INCREMENT PRIMARY KEY,
    simulation_id INT NOT NULL,
    task_name VARCHAR(50) NOT NULL,
    execution_time INT NOT NULL,
    period INT NOT NULL,
    deadline INT NOT NULL,
    arrival_time INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_tasks_simulation
        FOREIGN KEY (simulation_id)
        REFERENCES simulations(simulation_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 3. Simulation Results (Discrete execution intervals and job status)
CREATE TABLE simulation_results (
    result_id INT AUTO_INCREMENT PRIMARY KEY,
    simulation_id INT NOT NULL,
    task_name VARCHAR(50) NOT NULL,
    start_time INT NOT NULL,
    end_time INT NOT NULL,
    absolute_deadline INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    CONSTRAINT fk_results_simulation
        FOREIGN KEY (simulation_id)
        REFERENCES simulations(simulation_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Indexes for performance
CREATE INDEX idx_tasks_simulation_id ON tasks(simulation_id);
CREATE INDEX idx_results_simulation_id ON simulation_results(simulation_id);
CREATE INDEX idx_simulations_created_at ON simulations(created_at);
