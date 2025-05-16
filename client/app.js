// Main application state
const state = {
    currentTable: null,
    currentPage: 1,
    pageSize: 50,
    totalPages: 1
};

// DOM Elements
const elements = {
    apiInfo: document.getElementById('api-info'),
    tablesList: document.getElementById('tables-list'),
    tableData: document.getElementById('table-data'),
    pagination: document.getElementById('pagination')
};

// Initialize the application
async function init() {
    try {
        // Load API info first
        const apiInfo = await fetchApiInfo();
        renderApiInfo(apiInfo);

        // Then load tables
        const tables = await fetchTables();
        renderTables(tables);
    } catch (error) {
        showError(error.message);
    }
}

// Fetch API info from /api endpoint
async function fetchApiInfo() {
    const response = await fetch('/api');
    if (!response.ok) {
        throw new Error('Failed to fetch API info');
    }
    return await response.json();
}

// Fetch list of tables from /api/tables endpoint
async function fetchTables() {
    const response = await fetch('/api/tables');
    if (!response.ok) {
        throw new Error('Failed to fetch tables');
    }
    return await response.json();
}

// Fetch table data with pagination
async function fetchTableData(tableName, page = 1, limit = 50) {
    const response = await fetch(`/api/tables/${tableName}?page=${page}&limit=${limit}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch data for table ${tableName}`);
    }
    return await response.json();
}

// Render API info
function renderApiInfo(apiInfo) {
    const { api, version, database, endpoints } = apiInfo.data.attributes;
    
    elements.apiInfo.innerHTML = `
        <h3>${api} v${version}</h3>
        <p>Connected to database: <strong>${database}</strong></p>
        <p>Available endpoints:</p>
        <ul>
            <li><code>GET ${endpoints.tables}</code> - List tables</li>
            <li><code>GET ${endpoints.tableData}</code> - View table data</li>
        </ul>
    `;
}

// Render list of tables
function renderTables(tables) {
    elements.tablesList.innerHTML = '';
    
    tables.data.forEach(table => {
        const tableCard = document.createElement('div');
        tableCard.className = 'table-card';
        tableCard.textContent = table.attributes.name;
        tableCard.addEventListener('click', () => loadTableData(table.attributes.name));
        elements.tablesList.appendChild(tableCard);
    });
}

// Load and render table data
async function loadTableData(tableName, page = 1) {
    try {
        state.currentTable = tableName;
        state.currentPage = page;
        
        showLoading('#table-data');
        
        const data = await fetchTableData(tableName, page, state.pageSize);
        renderTableData(data);
    } catch (error) {
        showError(error.message, '#table-data');
    }
}

// Render table data with pagination controls
function renderTableData(data) {
    // Clear previous content
    elements.tableData.innerHTML = '';
    elements.pagination.innerHTML = '';
    
    if (!data.data || data.data.length === 0) {
        elements.tableData.innerHTML = '<p>No data found in this table</p>';
        return;
    }
    
    // Create table
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    // Create header row
    const headerRow = document.createElement('tr');
    Object.keys(data.data[0].attributes).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    // Create data rows
    data.data.forEach(row => {
        const tr = document.createElement('tr');
        Object.values(row.attributes).forEach(value => {
            const td = document.createElement('td');
            td.textContent = value !== null ? value.toString() : 'NULL';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    
    table.appendChild(thead);
    table.appendChild(tbody);
    elements.tableData.appendChild(table);
    
    // Add pagination if needed
    const total = data.meta.pagination.total;
    state.totalPages = data.meta.pagination.pages;
    
    if (state.totalPages > 1) {
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.disabled = state.currentPage === 1;
        prevButton.addEventListener('click', () => loadTableData(state.currentTable, state.currentPage - 1));
        
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.disabled = state.currentPage === state.totalPages;
        nextButton.addEventListener('click', () => loadTableData(state.currentTable, state.currentPage + 1));
        
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
        
        elements.pagination.appendChild(prevButton);
        elements.pagination.appendChild(pageInfo);
        elements.pagination.appendChild(nextButton);
    }
}

// Show loading state
function showLoading(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.innerHTML = '<div class="loading">Loading...</div>';
    }
}

// Show error message
function showError(message, selector = '#api-info') {
    const element = document.querySelector(selector);
    if (element) {
        element.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);