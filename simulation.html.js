// File name: simulation.html.js
// File description: script for simulation.html

// Foo

// Window global vars
window.original_dict = {};
window.interv_dict = {};
// Global vars
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let currentModal = null;

// TODO: remove this when backend is implemented
// to temporarily store the configurations of the interventions as a snapshot modal
let ft_int_configs = [];

function setupDraggableModals() {
    const modalHeaders = document.querySelectorAll('.modal-header');
    
    modalHeaders.forEach(header => {
        header.addEventListener('mousedown', startDrag);
    });

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
}

function startDrag(e) {
    isDragging = true;
    currentModal = e.target.closest('.modal-content');
    
    const rect = currentModal.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    currentModal.style.transform = 'none';
    document.body.classList.add('dragging');
}

function drag(e) {
    if (!isDragging || !currentModal) return;
    
    e.preventDefault();
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Keep modal within viewport bounds
    const maxX = window.innerWidth - currentModal.offsetWidth;
    const maxY = window.innerHeight - currentModal.offsetHeight;
    
    const boundedX = Math.max(0, Math.min(newX, maxX));
    const boundedY = Math.max(0, Math.min(newY, maxY));
    
    currentModal.style.left = boundedX + 'px';
    currentModal.style.top = boundedY + 'px';
}

function endDrag() {
    isDragging = false;
    currentModal = null;
    document.body.classList.remove('dragging');
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

class ModalContentSwitcher {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        if (modalId == "feature-modal") {
            this.currentSection = 'feature_modal_menu';
            
        }
        else if (modalId == "snapshot-modal") {
            this.currentSection = 'snapshot_modal_main_content';
            
        }
        this.init();
    }
    
    init() {
        // Event delegation - ONE listener for all buttons
        this.modal.addEventListener('click', (e) => {
            // Check if clicked element has data-target
            if (e.target.hasAttribute('data-target')) {
                const targetId = e.target.getAttribute('data-target');
                this.switchContent(targetId);
            }
        });
        
        // Show default section
        this.switchContent(this.currentSection);
    }
    
    switchContent(targetId) {
        // Hide all sections (now including menu)
        const allSections = this.modal.querySelectorAll('.modal-content-section');
        allSections.forEach(section => {
            section.classList.remove('active');
        });
        
        // Show target section
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSection = targetId;
        }
    }
}

// Initialize sliders
function initializeSliders() {
    const sliders = document.querySelectorAll('.slider');
    console.log('Found sliders:', sliders.length);

    sliders.forEach((slider, index) => {
        // console.log(`Attaching events to slider ${index}:`, slider.id);
        const valueDisplay = document.getElementById(slider.id.replace('-slider', '-value'));
        
        // Update display value
        function updateValue() {
            // console.log(valueDisplay);
            let value = slider.value;
            // if (slider.id === 'opacity-slider') {
            //     value += '%';
            // } else if (slider.id === 'scale-slider') {
            //     value += '%';
            // } else if (slider.id === 'duration-slider' || slider.id === 'delay-slider') {
            //     value += 'ms';
            // } else if (slider.id === 'blur-slider') {
            //     value += 'px';
            // }
            valueDisplay.textContent = value;
        }
        
        // Set initial value
        updateValue();
        
        // Update on input
        slider.addEventListener('input', updateValue);
        
        // Send to backend on change
        slider.addEventListener('change', function() {
            // console.log("slider changed!", this.id);
            const label = this.getAttribute('data-label');
            const value = this.value;
            sendSliderData(label, value);
        });
    });

    // console.log("function initializeSliders() test");
}

// Convert linear slider to exponential values
function getExponentialValue(sliderValue) {
    // Maps 0-100 to 1-1000000000
    return Math.pow(10, (sliderValue / 100) * 9);
}

// update the config snapshot pop-up
// TODO: edit this to receive JSON packages when backend is implemented
function updateSnapshot(json_package) {
    
    // JSON PACHGE

    // update the p element on the modal
    const content_text_elemt = document.getElementById("snapshot_modal_content_text");
    
    if (ft_int_configs.length === 0) {
        content_text_elemt.innerHTML = '<em>No data yet...</em>';
        return;
    }

    let html = '';
    ft_int_configs.forEach(item => {
        // const date = new Date(item.timestamp).toLocaleString();
        html += `
            <div class="data-item">
                <span class="label">${item.label}:</span>
                <span class="value">${item.value}</span>
                
            </div>
        `;
        //<span class="timestamp">${date}</span>
    });
    
    content_text_elemt.innerHTML = html;
    console.log("snapshot_modal_content_text" + " text updated!");
}

// Event call when slider changed
function sliderChanged (data) {
    // updates #value - tempo
    const value_para = document.getElementById('value');
    // value_para.textContent = "" + data.label + ": " + data.value;
    alert("" + data.label + ": " + data.value);
}

// Send slider data to backend
function sendSliderData(label, value) {
    // TODO: interv_dict, find the entry, and put these input in
    const data = {
        label: label,
        value: value,
        timestamp: Date.now()
    };
    
    console.log('Sending slider data:', data);
    // see if old data exist and is in the array
    // Find index of existing data with matching label
    const existingIndex = ft_int_configs.findIndex(item => item.label === data.label);
    
    if (existingIndex !== -1) {
        // Replace existing data
        ft_int_configs[existingIndex] = data;
    } else {
        // Add new data if no matching label found
        ft_int_configs.push(data);
    }

    console.log(ft_int_configs);
    // TODO: remove this when backend is implemented
    updateSnapshot(data);

    // Option 1: Send via fetch (REST API)
    /*
    fetch('/api/transitions/slider', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        console.log('Slider data sent successfully:', result);
    })
    .catch(error => {
        console.error('Error sending slider data:', error);
    });
    */
    
    // Option 2: Send via WebSocket
    /*
    if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
        window.websocket.send(JSON.stringify({
            type: 'slider_update',
            data: data
        }));
    }
    */
    
    // Option 3: Store in global variable for later use
    // window.transitionSettings = window.transitionSettings || {};
    // window.transitionSettings[label.toLowerCase()] = value;
    
    // Option 4: Trigger custom event
    // idk about this one
    // document.dispatchEvent(new CustomEvent('sliderChanged', {
    //     detail: data
    // }));
    // sliderChanged(data);
}

// optional, use if needed (for transitional_)
// if large values, turn to logarithmic
// slider.addEventListener('input', function() {
//     if (this.id.startsWith('transitional_')) {
//         const processedValue = Math.round(getExponentialValue(this.value, this.id));
//         valueDisplay.textContent = processedValue;

//     }
// });

// Wait for CSV data to be ready before initializing sliders
window.addEventListener('csvDataReady', function(event) {
    console.log('CSV data ready, initializing sliders...');
    
    // Setup slider value updates
    initializeSliders();
    console.log("sliders initialized!");
});

// PAGE LOAD event listener
// Interactive functionality
document.addEventListener('DOMContentLoaded', function() {


    // Initialize when page loads
    const modalSwitcher1 = new ModalContentSwitcher('feature-modal');
    const modalSwitcher2 = new ModalContentSwitcher('feature-modal');
    console.log("modalSwitcher initialized!");

    // DAG selection functionality
    const dagSelect = document.getElementById('dagSelect');
    const dagNodes = document.querySelectorAll('.dag-node');
    
    dagSelect.addEventListener('change', function() {
    dagNodes.forEach(node => node.classList.remove('selected'));
    if (this.value) {
        const selectedNode = document.querySelector(`[data-node="${this.value}"]`);
        if (selectedNode) {
        selectedNode.classList.add('selected');
        }
    }
    });
    
    // DAG node click functionality
    dagNodes.forEach(node => {
    node.addEventListener('click', function() {
        dagNodes.forEach(n => n.classList.remove('selected'));
        this.classList.add('selected');
        
        const nodeValue = this.getAttribute('data-node');
        dagSelect.value = nodeValue;
    });
    });
    
    // Get all buttons with data-modal attribute
    // this works for generally defined modals
    const buttons = document.querySelectorAll('[data-modal]');
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close-btn');

    // Open modal when button is clicked
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // console.log("Button is clicked!");
            const modalId = this.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'block';
                // Reset position when opening
                const modalContent = modal.querySelector('.modal-content');
                modalContent.style.top = '50px';
                modalContent.style.left = '50%';
                modalContent.style.transform = 'translateX(-50%)';
            }
        });
    });

    // Close modal when X is clicked
    closeButtons.forEach(closeBtn => {
        closeBtn.addEventListener('mousedown', function(e) {
            e.stopPropagation(); // Prevent drag from starting
        });
        
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.closest('.modal').style.display = 'none';
        });
    });

    // Close modal when clicking outside of it
    // window.addEventListener('click', function(event) {
    //     modals.forEach(modal => {
    //         if (event.target === modal) {
    //             modal.style.display = 'none';
    //         }
    //     });
    // });

    // Make modals draggable
    setupDraggableModals();
    
    // Small delay to ensure create_sliders.js had a chance to run
    setTimeout(() => {
        // Check if CSV data is already available
        if (window.csvData && window.csvData.length > 0) {
            console.log('CSV data already available, initializing sliders...');
            
            // Setup slider value updates
            initializeSliders();
            console.log("sliders initialized!");
        }
    }, 100);

    // Listen for custom slider events
    // document.addEventListener('sliderChanged', function(event) {
    //     console.log('Slider changed event received:', event.detail);
        
    //     const value_para = document.getElementById('value');
    //     value_para.textContent = event.detail.value;
    // });

    // listen to compute result and call backend
    // const dagSelect = document.getElementById('dagSelect');
    const computeBtn = document.getElementById('compute_result_button');

    computeBtn.addEventListener('click', () => {
        // console.log(csvData);
        const dagKey = dagSelect.value;
        if (!selectedFips) {
            return alert('Select a county first!');
        }
        if (!dagKey) {
            return alert('Please choose a DAG from the dropdown.');
        }
        
        // const selectedFips = window.selectedFips;
        // const sampleDict = extractDataByFIPS(csvData, selectedFips);
        // const sampleDict = extractDataByFIPS(csvData, 12081); // test
        
        console.log(original_dict);
        console.log(interv_dict);
        if (!original_dict || !interv_dict) {
            console.warn("Original dict and intervention dict not defined!")
        }
        // === STEP 4: POST BOTH DICTS TO YOUR PYTHON ===
        const payload = {
            original_dict: window.original_dict,
            interventions_dict: window.interv_dict,
            dag_key: dagKey
        };
        console.log('🛰️ About to POST payload:', payload);
        // Change port below if needed - norm: 5000
        fetch('http://127.0.0.1:5000/simulate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            // …

            .then(r => r.json())
            .then(({
                results
            }) => {
                document.getElementById('value').textContent =
                    `Original Prediction: ${results.original_label}`;
                document.getElementById('resValue').textContent =
                    `Counterfactual Prediction: ${results.counterfactual_label}`;
            })
            .catch(err => {
                console.error(err);
                alert("Error computing counterfactual. See console for details.");
            });
            
    }); //computeBtn.addEventListener('click', () => {

});





// // event listener to switch modal content
// function switchModalContent(targetId) {
    //     // Hide all modal content divs
    //     const allContents = document.querySelectorAll('.modal-body > div');
    //     allContents.forEach(div => div.style.display = 'none');
    
    //     // Show the target div
    //     const targetDiv = document.getElementById(targetId);
    //     if (targetDiv) {
        //         targetDiv.style.display = 'block';
        //     }
        // }

// // set event listener
// document.getElementById('transitions-btn').addEventListener('click', function() {
//     switchModalContent('feature_modal_transitions_');
// });
// EOF