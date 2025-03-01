/**
 * Collection of metrics and their associated SQL requests
 * Created by Pierre Awaragi
 */
const debug = require("debug")("metrics");
const client = require('prom-client');

// UP metric
const up = new client.Gauge({ name: 'mssql_up', help: "UP Status" });

// Query based metrics
// -------------------
const mssql_instance_local_time = {
    metrics: {
        mssql_instance_local_time: new client.Gauge({ name: 'mssql_instance_local_time', help: 'Number of seconds since epoch on local instance' })
    },
    query: `SELECT DATEDIFF(second, '19700101', GETUTCDATE())`,
    collect: function (rows, metrics) {
        const mssql_instance_local_time = Number.parseFloat(rows[0][0].value);
        debug("Fetch current time", mssql_instance_local_time);
        metrics.mssql_instance_local_time.set(mssql_instance_local_time);
    }
};

const mssql_connections = {
    metrics: {
        mssql_connections: new client.Gauge({ name: 'mssql_connections', help: 'Number of active connections', labelNames: ['database', 'state',] })
    },
    query: `SELECT DB_NAME(sP.dbid)
        , COUNT(sP.spid)
FROM sys.sysprocesses sP
GROUP BY DB_NAME(sP.dbid)`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const database = row[0].value;
            const mssql_connections = Number.parseFloat(row[1].value);
            debug("Fetch number of connections for database", database, mssql_connections);
            metrics.mssql_connections.set({ database: database, state: 'current' }, mssql_connections);
        }
    }
};

const mssql_deadlocks = {
    metrics: {
        mssql_deadlocks_per_second: new client.Gauge({ name: 'mssql_deadlocks', help: 'Number of lock requests per second that resulted in a deadlock since last restart' })
    },
    query: `SELECT cntr_value
FROM sys.dm_os_performance_counters
where counter_name = 'Number of Deadlocks/sec' AND instance_name = '_Total'`,
    collect: function (rows, metrics) {
        const mssql_deadlocks = Number.parseFloat(rows[0][0].value);
        debug("Fetch number of deadlocks/sec", mssql_deadlocks);
        metrics.mssql_deadlocks_per_second.set(mssql_deadlocks)
    }
};

const mssql_user_errors = {
    metrics: {
        mssql_user_errors: new client.Gauge({ name: 'mssql_user_errors', help: 'Number of user errors/sec since last restart' })
    },
    query: `SELECT cntr_value
FROM sys.dm_os_performance_counters
where counter_name = 'Errors/sec' AND instance_name = 'User Errors'`,
    collect: function (rows, metrics) {
        const mssql_user_errors = Number.parseFloat(rows[0][0].value);
        debug("Fetch number of user errors/sec", mssql_user_errors);
        metrics.mssql_user_errors.set(mssql_user_errors)
    }
};

const mssql_kill_connection_errors = {
    metrics: {
        mssql_kill_connection_errors: new client.Gauge({ name: 'mssql_kill_connection_errors', help: 'Number of kill connection errors/sec since last restart' })
    },
    query: `SELECT cntr_value
FROM sys.dm_os_performance_counters
where counter_name = 'Errors/sec' AND instance_name = 'Kill Connection Errors'`,
    collect: function (rows, metrics) {
        const mssql_kill_connection_errors = Number.parseFloat(rows[0][0].value);
        debug("Fetch number of kill connection errors/sec", mssql_kill_connection_errors);
        metrics.mssql_kill_connection_errors.set(mssql_kill_connection_errors)
    }
};

const mssql_log_growths = {
    metrics: {
        mssql_log_growths: new client.Gauge({ name: 'mssql_log_growths', help: 'Total number of times the transaction log for the database has been expanded last restart', labelNames: ['database'] }),
    },
    query: `SELECT rtrim(instance_name),cntr_value
FROM sys.dm_os_performance_counters where counter_name = 'Log Growths'
and  instance_name <> '_Total'`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const database = row[0].value;
            const mssql_log_growths = Number.parseFloat(row[1].value);
            debug("Fetch number log growths for database", database);
            metrics.mssql_log_growths.set({ database: database }, mssql_log_growths);
        }
    }
};

const mssql_page_life_expectancy = {
    metrics: {
        mssql_page_life_expectancy: new client.Gauge({ name: 'mssql_page_life_expectancy', help: 'Indicates the minimum number of seconds a page will stay in the buffer pool on this node without references. The traditional advice from Microsoft used to be that the PLE should remain above 300 seconds' })
    },
    query: `SELECT TOP 1  cntr_value
FROM sys.dm_os_performance_counters with (nolock)where counter_name='Page life expectancy'`,
    collect: function (rows, metrics) {
        const mssql_page_life_expectancy = Number.parseFloat(rows[0][0].value);
        debug("Fetch page life expectancy", mssql_page_life_expectancy);
        metrics.mssql_page_life_expectancy.set(mssql_page_life_expectancy)
    }
};

const mssql_io_stall = {
    metrics: {
        mssql_io_stall: new client.Gauge({ name: 'mssql_io_stall', help: 'Wait time (ms) of stall since last restart', labelNames: ['database', 'type'] }),
        mssql_io_stall_total: new client.Gauge({ name: 'mssql_io_stall_total', help: 'Wait time (ms) of stall since last restart', labelNames: ['database'] }),
    },
    query: `SELECT
cast(DB_Name(a.database_id) as varchar) as name,
    max(io_stall_read_ms),
    max(io_stall_write_ms),
    max(io_stall)
FROM
sys.dm_io_virtual_file_stats(null, null) a
INNER JOIN sys.master_files b ON a.database_id = b.database_id and a.file_id = b.file_id
group by a.database_id`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const database = row[0].value;
            const read = Number.parseFloat(row[1].value);
            const write = Number.parseFloat(row[2].value);
            const stall = Number.parseFloat(row[3].value);
            debug("Fetch number of stalls for database", database);
            metrics.mssql_io_stall_total.set({ database: database }, stall);
            metrics.mssql_io_stall.set({ database: database, type: "read" }, read);
            metrics.mssql_io_stall.set({ database: database, type: "write" }, write);
        }
    }
};

const mssql_batch_requests = {
    metrics: {
        mssql_batch_requests: new client.Gauge({ name: 'mssql_batch_requests', help: 'Number of Transact-SQL command batches received per second. This statistic is affected by all constraints (such as I/O, number of users, cachesize, complexity of requests, and so on). High batch requests mean good throughput' })
    },
    query: `SELECT TOP 1 cntr_value
FROM sys.dm_os_performance_counters where counter_name = 'Batch Requests/sec'`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const mssql_batch_requests = Number.parseFloat(row[0].value);
            debug("Fetch number of batch requests per second", mssql_batch_requests);
            metrics.mssql_batch_requests.set(mssql_batch_requests);
        }
    }
};

const mssql_os_process_memory = {
    metrics: {
        mssql_page_fault_count: new client.Gauge({ name: 'mssql_page_fault_count', help: 'Number of page faults since last restart' }),
        mssql_memory_utilization_percentage: new client.Gauge({ name: 'mssql_memory_utilization_percentage', help: 'Percentage of memory utilization' }),
    },
    query: `SELECT page_fault_count, memory_utilization_percentage 
from sys.dm_os_process_memory`,
    collect: function (rows, metrics) {
        const page_fault_count = Number.parseFloat(rows[0][0].value);
        const memory_utilization_percentage = Number.parseFloat(rows[0][1].value);
        debug("Fetch page fault count", page_fault_count);
        metrics.mssql_page_fault_count.set(page_fault_count);
        metrics.mssql_memory_utilization_percentage.set(memory_utilization_percentage);
    }
};

const mssql_os_sys_memory = {
    metrics: {
        mssql_total_physical_memory_kb: new client.Gauge({ name: 'mssql_total_physical_memory_kb', help: 'Total physical memory in KB' }),
        mssql_available_physical_memory_kb: new client.Gauge({ name: 'mssql_available_physical_memory_kb', help: 'Available physical memory in KB' }),
        mssql_total_page_file_kb: new client.Gauge({ name: 'mssql_total_page_file_kb', help: 'Total page file in KB' }),
        mssql_available_page_file_kb: new client.Gauge({ name: 'mssql_available_page_file_kb', help: 'Available page file in KB' }),
    },
    query: `SELECT total_physical_memory_kb, available_physical_memory_kb, total_page_file_kb, available_page_file_kb 
from sys.dm_os_sys_memory`,
    collect: function (rows, metrics) {
        const mssql_total_physical_memory_kb = Number.parseFloat(rows[0][0].value);
        const mssql_available_physical_memory_kb = Number.parseFloat(rows[0][1].value);
        const mssql_total_page_file_kb = Number.parseFloat(rows[0][2].value);
        const mssql_available_page_file_kb = Number.parseFloat(rows[0][3].value);
        debug("Fetch system memory information");
        metrics.mssql_total_physical_memory_kb.set(mssql_total_physical_memory_kb);
        metrics.mssql_available_physical_memory_kb.set(mssql_available_physical_memory_kb);
        metrics.mssql_total_page_file_kb.set(mssql_total_page_file_kb);
        metrics.mssql_available_page_file_kb.set(mssql_available_page_file_kb);
    }
};

const mssql_host_conenct = {
    metrics: {
        mssql_host_connect_count: new client.Gauge({ name: 'mssql_host_connect_count', help: 'mssql host conenct count', labelNames: ['hostname'] }),
    },
    query: `select host_name,count(*) from sys.dm_exec_sessions where is_user_process=1 group by host_name`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const mssql_host_connect_count = Number.parseFloat(row[1].value);
            const mssql_host_hostname = row[0].value;
            metrics.mssql_host_connect_count.set({ hostname: mssql_host_hostname }, mssql_host_connect_count);
        }
    }
};

const mssql_network_packs = {
    metrics: {
        mssql_network_packs_read_kb: new client.Gauge({ name: 'mssql_network_packs_read_kb', help: 'mssql host conenct mssql_network_packs read in kb'}),
        mssql_network_packs_write_kb: new client.Gauge({ name: 'mssql_network_packs_write_kb', help: 'mssql host conenct mssql_network_packs write in kb'})
    },
    query: `SELECT round(SUM(net_packet_size * 1.0 * num_reads / 1024), 0) AS read_kb , round(SUM(net_packet_size * 1.0 * num_writes / 1024), 0) AS write_kb FROM sys.dm_exec_connections WHERE session_id IN ( SELECT session_id FROM sys.dm_exec_sessions WHERE is_user_process = 1 )`,
    collect: function (rows, metrics) {
        const mssql_network_packs_read_kb = Number.parseFloat(rows[0][0].value);
        const mssql_network_packs_write_kb = Number.parseFloat(rows[0][1].value);
        metrics.mssql_network_packs_read_kb.set(mssql_network_packs_read_kb);
        metrics.mssql_network_packs_write_kb.set(mssql_network_packs_write_kb);

    }
};



const mssql_logspace = {
    metrics: {
        mssql_logspace_size_mb: new client.Gauge({ name: 'mssql_logspace_size_mb', help: 'mssql  log file size in mb',labelNames: ['database','status']}),
    },
    query: `SELECT DB_NAME(database_id) AS DatabaseName, Name, Physical_Name , size * 8 / 1024 AS SizeMB, state FROM sys.master_files WHERE type = 1`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const mssql_logspace_databse = row[0].value;
            const mssql_logspace_size_mb = Number.parseFloat(row[3].value);
            const mssql_logspace_status = Number.parseFloat(row[4].value)==0 ? "online": "offline"; 
            metrics.mssql_logspace_size_mb.set({database: mssql_logspace_databse,status:mssql_logspace_status},mssql_logspace_size_mb);
        }
    }
};


const mssql_databse_space = {
    metrics: {
        mssql_databse_space_mb: new client.Gauge({ name: 'mssql_databse_space_mb', help: 'mssql  databse  file size in mb',labelNames: ['database','status']}),
    },
    query: `SELECT DB_NAME(database_id) AS DatabaseName, Name, Physical_Name , size * 8 / 1024 AS SizeMB, state FROM sys.master_files WHERE type = 0`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const mssql_databsespace_databse = row[0].value;
            const mssql_databsespace_size_mb = Number.parseFloat(row[3].value);
            const mssql_databsespace_status = Number.parseFloat(row[4].value)==0 ? "online": "offline"; 
            metrics.mssql_databse_space_mb.set({database: mssql_databsespace_databse,status:mssql_databsespace_status},mssql_databsespace_size_mb);
        }
    }
};




const metrics = [
    mssql_instance_local_time,
    mssql_connections,
    mssql_deadlocks,
    mssql_user_errors,
    mssql_kill_connection_errors,
    mssql_log_growths,
    mssql_page_life_expectancy,
    mssql_io_stall,
    mssql_batch_requests,
    mssql_os_process_memory,
    mssql_os_sys_memory,
    mssql_host_conenct,
    mssql_network_packs,
    mssql_logspace,
    mssql_databse_space
];

module.exports = {
    client: client,
    up: up,
    metrics: metrics,
};

// DOCUMENTATION of queries and their associated metrics (targeted to DBAs)
if (require.main === module) {
    metrics.forEach(function (m) {
        for (let key in m.metrics) {
            if (m.metrics.hasOwnProperty(key)) {
                console.log("--", m.metrics[key].name, m.metrics[key].help);
            }
        }
        console.log(m.query + ";");
        console.log("");
    });

    console.log("/*");
    metrics.forEach(function (m) {
        for (let key in m.metrics) {
            if (m.metrics.hasOwnProperty(key)) {
                console.log("* ", m.metrics[key].name + (m.metrics[key].labelNames.length > 0 ? ("{" + m.metrics[key].labelNames + "}") : ""), m.metrics[key].help);
            }
        }
    });
    console.log("*/");
}
