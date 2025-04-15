// Filename: script.js

const chatbox = document.getElementById('chatbox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const statusDiv = document.getElementById('status');

// --- Configuration ---
const API_ENDPOINT = '/api/chat';
// ---------------------

// Function to add a message to the chatbox
function addMessage(message, sender) {
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message-container');

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

    // Basic Markdown-like formatting for newlines (replace \n with <br>)
    messageElement.innerHTML = message.replace(/\n/g, '<br>');

    messageContainer.appendChild(messageElement);
    chatbox.appendChild(messageContainer);
    chatbox.scrollTop = chatbox.scrollHeight; // Scroll to bottom
}

// Function to show status messages
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = isError ? 'error-message' : '';
}

// --- Geolocation Function ---
// Wraps geolocation in a Promise for easier async/await usage
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser.'));
        } else {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                },
                (error) => {
                    // Map error codes to more user-friendly messages
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            reject(new Error("Location permission denied."));
                            break;
                        case error.POSITION_UNAVAILABLE:
                            reject(new Error("Location information is unavailable."));
                            break;
                        case error.TIMEOUT:
                            reject(new Error("Location request timed out."));
                            break;
                        default:
                            reject(new Error(`An unknown error occurred (Code: ${error.code}).`));
                            break;
                    }
                },
                { // Optional: Geolocation options
                  enableHighAccuracy: false, // Faster, less battery, might be less accurate
                  timeout: 10000, // 10 seconds
                  maximumAge: 60000 // Allow cached location up to 1 minute old
                }
            );
        }
    });
}


// --- Updated sendMessage Function ---
async function sendMessage() {
    const messageText = userInput.value.trim();
    if (!messageText) return;

    addMessage(messageText, 'user'); // Add user's raw message first
    userInput.value = '';
    sendButton.disabled = true;
    showStatus('Getting context...'); // Initial status

    let locationInfo = "Location not available"; // Default
    let dateTimeInfo = new Date().toLocaleString(); // Get current date and time

    // --- Attempt to get location ---
    try {
        // Ask for location - browser will prompt if needed
        showStatus('Fetching location (check browser permission)...');
        const location = await getCurrentLocation();
        // Format location nicely
        locationInfo = `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}`;
         showStatus(''); // Clear status briefly before next step
    } catch (error) {
        console.warn("Location fetch error:", error.message);
        // Keep locationInfo as "Location not available" or update it
        locationInfo = `Location Error: ${error.message}`;
        // Don't show location error permanently in status, just log it
        showStatus(''); // Clear status
    }
    // -----------------------------


    // --- Prepare message with context ---
    // Append context in a structured way the LLM might understand
    const messageWithContext = `${messageText}

[Context: Time: ${dateTimeInfo} | ${locationInfo}]`;

    // console.log("Sending to API:", messageWithContext); // For debugging

    showStatus('Assistant is thinking...'); // Update status

    // --- Send to API ---
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send the message *with* the appended context
            body: JSON.stringify({ message: messageWithContext }),
        });

        if (!response.ok) {
            let errorData;
             try { errorData = await response.json(); } catch (e) {}
             const errorMessage = errorData?.error || `HTTP error! Status: ${response.status}`;
             console.error('API Error Response:', errorData);
             throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.reply) {
            addMessage(data.reply, 'bot');
        } else {
            addMessage("Sorry, I didn't get a valid response.", 'bot');
            console.warn("Received successful response but no 'reply' field:", data);
        }
        showStatus(''); // Clear status on success

    } catch (error) {
        console.error('Error sending message:', error);
        showStatus(`Error: ${error.message}`, true); // Show API/network errors
    } finally {
        sendButton.disabled = false;
        userInput.focus();
    }
}

// Event Listeners (no changes needed)
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Add initial bot message on load
addMessage("Hello! Ask me anything about astronomy or telescopes. I can use your current time and location for observation tips if you grant permission.", 'bot');