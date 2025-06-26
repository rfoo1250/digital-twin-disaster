// File name: / create_sliders.js
// File description: Generate sliders for the modal
//                  reads from data_features.csv as well
//                  Focused on News, Reddit, and Transition columns

/*  TODO: 
 * communicate with main.js to have read data_features.csv so here dont have to read again
 * 
 */

// FOo

let csvData = [];
let filteredData = {};
window.interv_dict = {};

// Define the specific columns we're interested in
const newsColumns = [
    'Num_News', 'News_Trees', 'News_Power Lines', 'News_Roofs', 
    'News_Buildings', 'News_Vehicles', 'News_Agriculture', 'News_Infrastructure'
];

const redditColumns = [
    'Num_Reddit', 'Reddit_Trees', 'Reddit_Power Lines', 'Reddit_Roofs', 
    'Reddit_Buildings', 'Reddit_Vehicles', 'Reddit_Agriculture', 'Reddit_Infrastructure'
];

const transitionColumns = [
    'transition_0_0', 'transition_0_1', 'transition_0_2', 'transition_0_3', 'transition_0_4', 
    'transition_0_5', 'transition_0_6', 'transition_0_7', 'transition_0_8', 'transition_1_0', 
    'transition_1_1', 'transition_1_2', 'transition_1_3', 'transition_1_4', 'transition_1_5', 
    'transition_1_6', 'transition_1_7', 'transition_1_8', 'transition_2_0', 'transition_2_1', 
    'transition_2_2', 'transition_2_3', 'transition_2_4', 'transition_2_5', 'transition_2_6', 
    'transition_2_7', 'transition_2_8', 'transition_3_0', 'transition_3_1', 'transition_3_2', 
    'transition_3_3', 'transition_3_4', 'transition_3_5', 'transition_3_6', 'transition_3_7', 
    'transition_3_8', 'transition_4_0', 'transition_4_1', 'transition_4_2', 'transition_4_3', 
    'transition_4_4', 'transition_4_5', 'transition_4_6', 'transition_4_7', 'transition_4_8', 
    'transition_5_0', 'transition_5_1', 'transition_5_2', 'transition_5_3', 'transition_5_4', 
    'transition_5_5', 'transition_5_6', 'transition_5_7', 'transition_5_8', 'transition_6_0', 
    'transition_6_1', 'transition_6_2', 'transition_6_3', 'transition_6_4', 'transition_6_5', 
    'transition_6_6', 'transition_6_7', 'transition_6_8', 'transition_7_0', 'transition_7_1', 
    'transition_7_2', 'transition_7_3', 'transition_7_4', 'transition_7_5', 'transition_7_6', 
    'transition_7_7', 'transition_7_8', 'transition_8_0', 'transition_8_1', 'transition_8_2', 
    'transition_8_3', 'transition_8_4', 'transition_8_5', 'transition_8_6', 'transition_8_7', 
    'transition_8_8'
];

/**
 * Load and parse CSV file
 * @param {string} csvText - Raw CSV text content
 * @returns {Promise<Object>} Parsed and filtered data
 */
function loadCSV(csvText) {
    return new Promise((resolve, reject) => {
        try {
            // Parse CSV using D3
            const rawData = d3.csvParse(csvText, (d) => {
                // Clean up the data - trim whitespace from all values
                const cleaned = {};
                Object.keys(d).forEach(key => {
                    const cleanKey = key.trim();
                    const value = d[key] ? d[key].toString().trim() : '';
                    // Convert numeric values
                    cleaned[cleanKey] = isNumeric(value) ? +value : value;
                });
                return cleaned;
            });

            if (rawData.length === 0) {
                reject(new Error('CSV file appears to be empty'));
                return;
            }

            csvData = rawData;
            
            // Filter and organize data by categories
            filteredData = {
                news: extractColumns(rawData, newsColumns),
                reddit: extractColumns(rawData, redditColumns),
                transitions: extractColumns(rawData, transitionColumns),
                all: rawData
            };

            console.log(`CSV loaded successfully: ${rawData.length} rows`);
            console.log('Available categories:', Object.keys(filteredData));
            
            resolve(filteredData);
            
        } catch (error) {
            reject(new Error('Error parsing CSV: ' + error.message));
        }
    });
}

/**
 * Load CSV from file input
 * @param {File} file - File object from input
 * @returns {Promise<Object>} Parsed data
 */
function loadCSVFromFile(file) {
    return new Promise((resolve, reject) => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            reject(new Error('Please select a CSV file'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            loadCSV(e.target.result)
                .then(resolve)
                .catch(reject);
        };
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsText(file);
    });
}

/**
 * Load CSV from URL
 * @param {string} url - URL to CSV file
 * @returns {Promise<Object>} Parsed data
 */
function loadCSVFromURL(url) {
    return d3.csv(url, (d) => {
        const cleaned = {};
        Object.keys(d).forEach(key => {
            const cleanKey = key.trim();
            const value = d[key] ? d[key].toString().trim() : '';
            cleaned[cleanKey] = isNumeric(value) ? +value : value;
        });
        return cleaned;
    }).then(rawData => {
        csvData = rawData;
        filteredData = {
            news: extractColumns(rawData, newsColumns),
            reddit: extractColumns(rawData, redditColumns),
            transitions: extractColumns(rawData, transitionColumns),
            all: rawData
        };
        
        console.log(`CSV loaded from URL: ${rawData.length} rows`);
        return filteredData;
    });
}

/**
 * Extract specific columns from data
 * @param {Array} data - Full dataset
 * @param {Array} columns - Column names to extract
 * @returns {Array} Filtered data with only specified columns
 */
function extractColumns(data, columns) {
    return data.map(row => {
        const filtered = {};
        columns.forEach(col => {
            filtered[col] = row[col] !== undefined ? row[col] : null;
        });
        return filtered;
    });
}

/**
 * Check if a value is numeric
 * @param {string} str - String to check
 * @returns {boolean} True if numeric
 */
function isNumeric(str) {
    if (str === '' || str === null || str === undefined) return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}

/**
 * Get data for specific category
 * @param {string} category - 'news', 'reddit', 'transitions', or 'all'
 * @returns {Array} Filtered data
 */
function getData(category = 'all') {
    if (!filteredData[category]) {
        console.warn(`Category '${category}' not found. Available: ${Object.keys(filteredData).join(', ')}`);
        return [];
    }
    return filteredData[category];
}

/**
 * Get summary statistics for a category
 * @param {string} category - Category name
 * @returns {Object} Summary statistics
 */
function getSummaryStats(category) {
    const data = getData(category);
    if (data.length === 0) return {};
    
    const stats = {};
    const columns = Object.keys(data[0]);
    
    columns.forEach(col => {
        const values = data.map(d => d[col]).filter(v => v !== null && !isNaN(v));
        if (values.length > 0) {
            stats[col] = {
                count: values.length,
                sum: d3.sum(values),
                mean: d3.mean(values),
                median: d3.median(values),
                min: d3.min(values),
                max: d3.max(values),
                std: d3.deviation(values)
            };
        }
    });
    
    return stats;
}

/**
 * Get news vs reddit comparison
 * @returns {Array} Comparison data
 */
function getNewsRedditComparison() {
    const newsData = getData('news');
    const redditData = getData('reddit');
    
    if (newsData.length !== redditData.length) {
        console.warn('News and Reddit data have different lengths');
        return [];
    }
    
    return newsData.map((newsRow, i) => {
        const redditRow = redditData[i];
        const comparison = {
            index: i,
            news_total: newsRow.Num_News || 0,
            reddit_total: redditRow.Num_Reddit || 0
        };
        
        // Compare specific damage types
        const damageTypes = ['Trees', 'Power Lines', 'Roofs', 'Buildings', 'Vehicles', 'Agriculture', 'Infrastructure'];
        damageTypes.forEach(type => {
            const newsCol = `News_${type}`;
            const redditCol = `Reddit_${type}`;
            comparison[`news_${type.toLowerCase()}`] = newsRow[newsCol] || 0;
            comparison[`reddit_${type.toLowerCase()}`] = redditRow[redditCol] || 0;
            comparison[`diff_${type.toLowerCase()}`] = (newsRow[newsCol] || 0) - (redditRow[redditCol] || 0);
        });
        
        return comparison;
    });
}

/**
 * Get transition matrix summary (9x9 grid)
 * @returns {Object} Transition matrix data organized by from/to states
 */
function getTransitionMatrix() {
    const transData = getData('transitions');
    if (transData.length === 0) return {};
    
    const matrix = {};
    
    // Initialize 9x9 matrix
    for (let from = 0; from < 9; from++) {
        matrix[from] = {};
        for (let to = 0; to < 9; to++) {
            const colName = `transition_${from}_${to}`;
            const values = transData.map(d => d[colName] || 0);
            matrix[from][to] = {
                column: colName,
                values: values,
                sum: d3.sum(values),
                mean: d3.mean(values),
                count: values.filter(v => v > 0).length
            };
        }
    }
    
    return matrix;
}

/**
 * Export filtered data as CSV
 * @param {string} category - Category to export
 * @param {string} filename - Output filename
 */
function exportCategory(category, filename) {
    const data = getData(category);
    if (data.length === 0) {
        console.error('No data to export');
        return;
    }
    
    const csvString = d3.csvFormat(data);
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `${category}_data.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log(`Exported ${data.length} rows to ${filename}`);
}

// Example usage functions
function printDataSummary() {
    console.log('=== Data Summary ===');
    console.log(`Total rows: ${csvData.length}`);
    console.log(`News columns: ${newsColumns.length}`);
    console.log(`Reddit columns: ${redditColumns.length}`);
    console.log(`Transition columns: ${transitionColumns.length}`);
    console.log('\nSample news data:', getData('news').slice(0, 3));
    console.log('\nSample reddit data:', getData('reddit').slice(0, 3));
}

// ========== SLIDER GENERATION FUNCTIONS ==========
// Integrated from create_sliders.js
// Updated function for transition sliders - uses actual column names
function createSlider1(columnName) {
    return `
<div class="slider-container">
  <div class="slider-label">
    <span>${columnName}</span>
    <span class="slider-value" id="${columnName}-value">100</span>
  </div>
<input
     type="range" min="0" max="1" value="0.5" step="0.00000001"
    class="slider"
     id="${columnName}-slider"
     data-label="${columnName}"
     data-column="${columnName}">
</div>`;
}

// Updated function for news sliders - uses actual column names
function createSlider2(columnName) {
    // Convert column name to a more readable format
    // example: News_Power Lines --> news_power_lines
    const displayName = columnName.replace('News_', '').toLowerCase().replace(' ', '_');
    const sliderName = `news_${displayName}`;
    
    return `
<div class="slider-container">
  <div class="slider-label">
    <span>${sliderName}</span>
    <span class="slider-value" id="${sliderName}-value">100</span>
  </div>
  <input type="range" min="0" max="1000" value="100" class="slider" id="${sliderName}-slider" data-label="${sliderName}" data-column="${columnName}">
</div>`;
}

// Updated function for reddit sliders - uses actual column names
function createSlider3(columnName) {
    // Convert column name to a more readable format
    // example: Reddit_Power Lines --> reddit_power_lines
    const displayName = columnName.replace('Reddit_', '').toLowerCase().replace(' ', '_');
    const sliderName = `reddit_${displayName}`;
    
    return `
<div class="slider-container">
  <div class="slider-label">
    <span>${sliderName}</span>
    <span class="slider-value" id="${sliderName}-value">100</span>
  </div>
  <input type="range" min="0" max="1000" value="100" class="slider" id="${sliderName}-slider" data-label="${sliderName}" data-column="${columnName}">
</div>`;
}

// Updated generateSliders function to work with column names
function generateSliders(columnArrays) {
    const feature_cats = [
        'feature_modal_transitions_', 
        'feature_modal_news_',
        'feature_modal_reddit_'
    ];
    
    // Find the modal content sections
    const modalSections = [
        document.getElementById('feature_modal_transitions_'),
        document.getElementById('feature_modal_news_'),
        document.getElementById('feature_modal_reddit_')
    ];

    for (let ii = 0; ii < modalSections.length; ii++) {
        const modalSection = modalSections[ii];
        
        if (!modalSection) {
            console.error('Modal section not found:', feature_cats[ii]);
            continue;
        }
        
        // Find where to insert sliders (after the h2 element)
        const h2Element = modalSection.querySelector('h2');
        const existingSliders = modalSection.querySelectorAll('.slider-container');
        
        if (!h2Element) {
            console.error('H2 element not found in modal:', feature_cats[ii]);
            continue;
        }
        
        // Remove existing sliders if they exist (to avoid duplicates)
        existingSliders.forEach(slider => slider.remove());
        
        // Generate all sliders HTML based on column arrays
        let slidersHTML = '';
        const columns = columnArrays[ii] || [];
        
        if (ii === 0) { // feature_modal_transitions_
            columns.forEach(columnName => {
                slidersHTML += createSlider1(columnName);
            });
        }
        else if (ii === 1) { // feature_modal_news_
            columns.forEach(columnName => {
                slidersHTML += createSlider2(columnName);
            });
        }
        else if (ii === 2) { // feature_modal_reddit_
            columns.forEach(columnName => {
                slidersHTML += createSlider3(columnName);
            });
        }
        
        // Insert sliders after the h2 element
        h2Element.insertAdjacentHTML('afterend', slidersHTML);
        
        // Add event listeners to all sliders
        addSliderListeners(feature_cats[ii]);
    }
}

// Updated function to generate sliders based on loaded CSV data
/**
 * Generate sliders based on loaded CSV data
 * This function uses the actual column data to create appropriate sliders
 */
function generateSlidersFromData() {
    if (!csvData || csvData.length === 0) {
        console.error('No CSV data loaded. Load CSV first using loadCSV() or loadCSVFromFile()');
        return;
    }
    
    // Get available columns from the CSV
    const availableColumns = Object.keys(csvData[0]);
    
    // Filter available columns for each category
    const availableTransitions = transitionColumns.filter(col => availableColumns.includes(col));
    const availableNews = newsColumns.filter(col => col !== 'Num_News' && availableColumns.includes(col));
    const availableReddit = redditColumns.filter(col => col !== 'Num_Reddit' && availableColumns.includes(col));
    
    console.log(`Generating sliders from CSV data:`);
    console.log(`- ${availableTransitions.length} transition columns:`, availableTransitions);
    console.log(`- ${availableNews.length} news columns:`, availableNews);
    console.log(`- ${availableReddit.length} reddit columns:`, availableReddit);
    
    // Generate sliders with actual column names
    generateSliders([availableTransitions, availableNews, availableReddit]);
}

function addSliderListeners(feature_cat) {
    const sliders = document.querySelectorAll('#feature-modal .slider');
    
    sliders.forEach(slider => {
        slider.addEventListener('input', function() {
            const valueSpan = document.getElementById(this.id.replace('-slider', '-value'));
            if (valueSpan) {
                valueSpan.textContent = this.value;
            }
            // 2) record the intervention
      const col = this.getAttribute('data-column') || this.getAttribute('data-label');
      window.interv_dict[col] = parseFloat(this.value);
    //   console.log('interv_dict →', window.interv_dict);
        });
    });
}

// Optional - Function to regenerate sliders with different count
function regenerateSliders(counts) {
    // Remove all existing sliders
    const modalSections = [
        'feature_modal_transitions_',
        'feature_modal_news_', 
        'feature_modal_reddit_'
    ];
    
    modalSections.forEach(sectionId => {
        const existingSliders = document.querySelectorAll('#' + sectionId + ' .slider-container');
        existingSliders.forEach(slider => slider.remove());
    });
    
    // Generate new ones
    generateSliders(counts);
}

/**
 * Map slider IDs to CSV column names
 * @returns {Object} Mapping object
 */
// Updated mapping function to work with the new slider structure
function getSliderColumnMapping() {
    const mapping = {
        transitions: {},
        news: {},
        reddit: {}
    };
    
    // Map transition sliders (direct column name mapping)
    transitionColumns.forEach(col => {
        mapping.transitions[col] = col;
    });
    
    // Map news sliders (slider name -> column name)
    const newsLabels = newsColumns.filter(col => col !== 'Num_News');
    newsLabels.forEach(col => {
        const displayName = col.replace('News_', '').toLowerCase().replace(' ', '_');
        const sliderName = `news_${displayName}`;
        mapping.news[sliderName] = col;
    });
    
    // Map reddit sliders (slider name -> column name)
    const redditLabels = redditColumns.filter(col => col !== 'Num_Reddit');
    redditLabels.forEach(col => {
        const displayName = col.replace('Reddit_', '').toLowerCase().replace(' ', '_');
        const sliderName = `reddit_${displayName}`;
        mapping.reddit[sliderName] = col;
    });
    
    return mapping;
}

/**
 * Get slider values and map them to column names
 * @returns {Object} Current slider values mapped to column names
 */
// Updated function to get slider values with proper column mapping
function getSliderValues() {
    const values = {
        transitions: {},
        news: {},
        reddit: {}
    };
    
    // Get transition slider values (direct column name mapping)
    transitionColumns.forEach(col => {
        const slider = document.getElementById(`${col}-slider`);
        if (slider) {
            values.transitions[col] = parseFloat(slider.value);
        }
    });
    
    // Get news slider values
    const newsLabels = newsColumns.filter(col => col !== 'Num_News');
    newsLabels.forEach(col => {
        const displayName = col.replace('News_', '').toLowerCase().replace(' ', '_');
        const sliderName = `news_${displayName}`;
        const slider = document.getElementById(`${sliderName}-slider`);
        if (slider) {
            values.news[col] = parseFloat(slider.value);
        }
    });
    
    // Get reddit slider values
    const redditLabels = redditColumns.filter(col => col !== 'Num_Reddit');
    redditLabels.forEach(col => {
        const displayName = col.replace('Reddit_', '').toLowerCase().replace(' ', '_');
        const sliderName = `reddit_${displayName}`;
        const slider = document.getElementById(`${sliderName}-slider`);
        if (slider) {
            values.reddit[col] = parseFloat(slider.value);
        }
    });
    
    return values;
}

// Helper function to get slider values by category with readable names
function getSliderValuesByCategory() {
    const values = {
        transitions: {},
        news: {},
        reddit: {}
    };
    
    // Get all sliders and organize by category
    const allSliders = document.querySelectorAll('.slider');
    
    allSliders.forEach(slider => {
        const sliderId = slider.id;
        const value = parseFloat(slider.value);
        const columnName = slider.getAttribute('data-column') || slider.getAttribute('data-label');
        
        if (sliderId.includes('transition_')) {
            values.transitions[sliderId.replace('-slider', '')] = {
                value: value,
                column: columnName
            };
        } else if (sliderId.includes('news_')) {
            values.news[sliderId.replace('-slider', '')] = {
                value: value,
                column: columnName
            };
        } else if (sliderId.includes('reddit_')) {
            values.reddit[sliderId.replace('-slider', '')] = {
                value: value,
                column: columnName
            };
        }
    });
    
    return values;
}

// Updated fallback function for when CSV fails to load
function generateDefaultSliders() {
    console.log('Generating default sliders with column names...');
    
    // Use actual column names even for fallback
    const defaultTransitions = transitionColumns.slice(0, 81); // All transition columns
    const defaultNews = newsColumns.filter(col => col !== 'Num_News'); // All news columns except count
    const defaultReddit = redditColumns.filter(col => col !== 'Num_Reddit'); // All reddit columns except count
    
    generateSliders([defaultTransitions, defaultNews, defaultReddit]);
}

// ========== END SLIDER FUNCTIONS ==========

// Make functions available globally
window.loadCSV = loadCSV;
window.loadCSVFromFile = loadCSVFromFile;
window.loadCSVFromURL = loadCSVFromURL;
// window.getData = getData;
// window.getSummaryStats = getSummaryStats;
// window.getNewsRedditComparison = getNewsRedditComparison;
// window.getTransitionMatrix = getTransitionMatrix;
// window.exportCategory = exportCategory;
// window.printDataSummary = printDataSummary;

// Slider functions
// window.createSlider1 = createSlider1;
// window.createSlider2 = createSlider2;
// window.createSlider3 = createSlider3;
// window.generateSliders = generateSliders;
// window.addSliderListeners = addSliderListeners;
// window.regenerateSliders = regenerateSliders;
// window.generateSlidersFromData = generateSlidersFromData;
// window.getSliderColumnMapping = getSliderColumnMapping;
// window.getSliderValues = getSliderValues;

// Data access
window.newsColumns = newsColumns;
window.redditColumns = redditColumns;
window.transitionColumns = transitionColumns;
window.csvData = csvData;
window.filteredData = filteredData;

// Initialize sliders when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Try to auto-load data_features.csv
    loadCSVFromURL('data_features.csv')
        .then(data => {
            // console.log('Successfully loaded data_features.csv');
            // console.log(`Loaded ${csvData.length} rows of data`);
            
            // Generate sliders based on actual CSV data with column names
            generateSlidersFromData();
            
            // Optional: Print summary to console
            // printDataSummary();
            
            // Dispatch custom event to signal CSV is ready
            window.dispatchEvent(new CustomEvent('csvDataReady', { 
                detail: { data: data, success: true } 
            }));
        })
        .catch(error => {
            console.warn('Could not load data_features.csv:', error.message);
            console.log('Falling back to default slider generation with column names');
            
            // Fallback: Generate sliders with actual column names
            generateDefaultSliders();
            
            // Dispatch event even on failure so other scripts don't hang
            window.dispatchEvent(new CustomEvent('csvDataReady', { 
                detail: { data: null, success: false, error: error.message } 
            }));
        });
});

// console.log('CSV Reader Script with Slider Integration loaded.');
// console.log('CSV functions: loadCSV(), loadCSVFromFile(), loadCSVFromURL(), getData(), etc.');
// console.log('Slider functions: generateSliders(), generateSlidersFromData(), getSliderValues()');
// console.log('Use generateSlidersFromData() after loading CSV to create sliders based on actual data.');