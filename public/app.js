const API_URL = window.location.origin;
let items = []; 
let currentUser = null;
let currentFilter = 'All';
let uploadedFileBase64 = null;
let profilePicBase64 = null; // New for profile

// Chat State
let currentChatPostId = null;
let currentChatReceiverId = null;
let chatPollInterval = null;

function authHeaders() {
    const t = localStorage.getItem('token');
    if (!t) throw new Error("No session");
    return { 'Authorization': t };
}

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    renderFeed('All');

    // Search
    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('input', () => renderFeed(currentFilter));
    }
    
    // Scroll
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('main-nav');
        if(window.scrollY > 50) nav?.classList.add('scrolled-mode');
        else nav?.classList.remove('scrolled-mode');
    });

    const reportForm = document.getElementById('form-report');
    if(reportForm) reportForm.addEventListener('submit', handleReportSubmit);
});

// --- AUTH & SESSION ---
window.checkSession = async function() {
    const t = localStorage.getItem('token');
    if(t) {
        // Fetch fresh user data to get bio/pic
        try {
            const res = await fetch(`${API_URL}/user-info`, { headers: { 'Authorization': t }});
            if(res.ok) {
                currentUser = await res.json();
                localStorage.setItem('user', JSON.stringify(currentUser));
                updateNavUI(true);
            } else {
                throw new Error("Invalid token");
            }
        } catch(e) {
            console.log("Session invalid");
            logoutUser(false);
        }
    } else {
        updateNavUI(false);
    }
}

window.updateNavUI = function(isLoggedIn) {
    const navAuth = document.getElementById('nav-auth-section');
    const mobileAuth = document.getElementById('mobile-auth-section');
    let html = '';
    
    if (isLoggedIn && currentUser) {
        const name = currentUser.username.split('@')[0];
        html = `
            <div class="flex items-center gap-3">
                <button onclick="openProfileModal()" class="text-sm text-white hover:text-blue-400 font-bold flex items-center gap-2">
                    <img src="${currentUser.profilePic || 'https://via.placeholder.com/30'}" class="w-6 h-6 rounded-full border border-gray-500 object-cover">
                    ${name}
                </button>
                <button onclick="logoutUser()" class="text-xs border border-red-500 text-red-400 px-3 py-1 rounded hover:bg-red-500 hover:text-white transition">Logout</button>
            </div>`;
    } else {
        html = `
            <button onclick="openAuthModal('login')" class="text-sm text-gray-300 font-bold mr-4">Login</button>
            <button onclick="openAuthModal('register')" class="btn !w-auto !h-8 !px-4 !text-xs">Register</button>`;
    }
    if(navAuth) navAuth.innerHTML = html;
    if(mobileAuth) mobileAuth.innerHTML = html;
}

window.logoutUser = function(confirmLogout = true) {
    if (confirmLogout && !confirm("Log out?")) return;
    localStorage.clear();
    currentUser = null;
    location.reload();
};

window.loginUser = async function() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: email, password })
        });
        const data = await res.json();
        if(res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data));
            location.reload();
        } else alert(data.error);
    } catch(e) { alert("Login Error"); }
};

// --- PROFILE EDITING ---
window.openProfileModal = function() {
    if(!currentUser) return;
    
    // Reset Edit State
    document.getElementById('profile-bio').classList.remove('hidden');
    document.getElementById('profile-bio-input').classList.add('hidden');
    document.getElementById('btn-edit-profile').classList.remove('hidden');
    document.getElementById('btn-save-profile').classList.add('hidden');

    // Populate Data
    document.getElementById('profile-username').innerText = currentUser.username.split('@')[0];
    document.getElementById('profile-bio').innerText = currentUser.bio || "No bio yet.";
    document.getElementById('profile-bio-input').value = currentUser.bio || "";
    
    const imgEl = document.getElementById('profile-img-display');
    imgEl.src = currentUser.profilePic || "https://via.placeholder.com/100?text=User";
    
    // Reputation Logic (simplified for brevity)
    const points = currentUser.reputation || 0;
    document.getElementById('profile-points').innerText = points;
    document.getElementById('profile-tag').innerText = points > 100 ? "DETECTIVE" : "NOVICE";
    
    document.getElementById('modal-profile').classList.remove('hidden');
};

window.toggleEditProfile = function() {
    document.getElementById('profile-bio').classList.add('hidden');
    document.getElementById('profile-bio-input').classList.remove('hidden');
    document.getElementById('btn-edit-profile').classList.add('hidden');
    document.getElementById('btn-save-profile').classList.remove('hidden');
};

window.handleProfilePicSelect = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        profilePicBase64 = evt.target.result;
        document.getElementById('profile-img-display').src = profilePicBase64;
    };
    reader.readAsDataURL(file);
};

window.saveProfile = async function() {
    const newBio = document.getElementById('profile-bio-input').value;
    const updates = { bio: newBio };
    if(profilePicBase64) updates.profilePic = profilePicBase64;

    try {
        const res = await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json', ...authHeaders()},
            body: JSON.stringify(updates)
        });
        const data = await res.json();
        if(res.ok) {
            currentUser.bio = data.bio;
            currentUser.profilePic = data.profilePic;
            localStorage.setItem('user', JSON.stringify(currentUser));
            alert("Profile Updated!");
            openProfileModal(); // Refresh view
            updateNavUI(true);
        } else alert("Update failed");
    } catch(e) { alert("Server Error"); }
};

// --- FEED & SEARCH ---
window.renderFeed = async function(filterType) {
    const grid = document.getElementById('feed-grid');
    if(!grid) return;
    
    if(filterType) currentFilter = filterType;
    
    if(items.length === 0) {
        try {
            const res = await fetch(`${API_URL}/posts`);
            items = await res.json();
        } catch(e) { items = []; }
    }

    grid.innerHTML = ''; 
    const searchVal = document.getElementById('search-input')?.value.toLowerCase() || '';

    const filtered = items.filter(item => {
        const matchesType = (currentFilter === 'All') || (item.type === currentFilter);
        const matchesSearch = (item.title+item.description+item.location).toLowerCase().includes(searchVal);
        return matchesType && matchesSearch;
    });

    if(filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-3 text-center text-gray-500 py-10">No items found.</div>`;
        return;
    }

    filtered.forEach(item => {
        const bg = item.imageUrl ? `background-image: url('${item.imageUrl}')` : 'background-color: #333';
        const isResolved = item.status === 'Resolved';
        const card = `
        <div class="card group ${isResolved ? 'grayscale opacity-60' : ''}">
            <div class="card__img" style="${bg}"></div>
            <div class="card__img--hover" style="${bg}"></div>
            <div class="card__info">
                <span class="card__category text-${item.type === 'Lost' ? 'amber' : 'emerald'}-400">${item.type}</span>
                <h3 class="card__title truncate">${item.title}</h3>
                <span class="card__by text-xs">at ${item.location}</span>
                <button onclick="openDetails('${item._id}')" class="btn !h-8 !text-xs mt-4">Details</button>
            </div>
        </div>`;
        grid.innerHTML += card;
    });
};

// --- DETAILS & CHAT SYSTEM ---
window.openDetails = function(id) {
    const item = items.find(i => i._id === id);
    if(!item) return;

    // Reset Chat Interval
    if(chatPollInterval) clearInterval(chatPollInterval);
    currentChatPostId = item._id;

    // Populate Info
    document.getElementById('detail-title').innerText = item.title;
    document.getElementById('detail-desc').innerText = item.description;
    document.getElementById('detail-type').innerText = item.type;
    document.getElementById('detail-loc').innerText = item.location;
    
    const media = document.getElementById('detail-media');
    media.innerHTML = item.imageUrl ? `<img src="${item.imageUrl}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-gray-500">No Image</div>`;

    // Setup Actions (PIN / Verify)
    const actions = document.getElementById('detail-actions');
    const isOwner = currentUser && currentUser.username === item.authorName;
    
    if(item.status === 'Resolved') {
        actions.innerHTML = `<div class="text-green-500 font-bold text-center">ITEM RESOLVED</div>`;
    } else if(isOwner) {
        actions.innerHTML = `
            <div class="bg-gray-800 p-3 rounded">
                <p class="text-xs text-gray-400 mb-2">Verify Claimant PIN:</p>
                <div class="flex gap-2">
                    <input id="verify-pin-input" class="w-20 bg-black border border-gray-600 text-white text-center rounded">
                    <button onclick="verifyPin('${item._id}')" class="btn !w-auto !h-8 !text-xs bg-green-600">Verify</button>
                </div>
            </div>`;
    } else {
        actions.innerHTML = `<button onclick="generatePin('${item._id}')" class="btn w-full">I Found/Lost This!</button>
        <div id="pin-display" class="hidden text-center mt-2 text-white font-bold text-xl tracking-widest bg-blue-900/50 p-2 rounded"></div>`;
    }

    // Load Chat
    loadChat(item);
    document.getElementById('modal-details').classList.remove('hidden');
    
    // Auto-refresh chat every 3 seconds
    chatPollInterval = setInterval(() => loadChat(item), 3000);
};

window.loadChat = async function(item) {
    if(!currentUser) {
        document.getElementById('chat-display').innerHTML = `<p class="text-gray-500 text-center mt-10">Login to chat.</p>`;
        return;
    }

    try {
        const res = await fetch(`${API_URL}/messages/${item._id}`, { headers: authHeaders() });
        const data = await res.json();
        const display = document.getElementById('chat-display');
        const inputArea = document.getElementById('chat-input-area');

        if(data.isOwner) {
            // Owner View: List of Conversations
            inputArea.classList.add('hidden'); // Owner selects a chat first
            if(data.conversations.length === 0) {
                display.innerHTML = `<p class="text-gray-500 text-center text-xs mt-4">No inquiries yet.</p>`;
            } else {
                let html = `<p class="text-xs text-gray-400 mb-2">Recent Inquiries:</p>`;
                data.conversations.forEach(c => {
                    html += `
                    <div onclick="openSpecificChat('${item._id}', '${c.userId}')" class="bg-gray-800 p-3 rounded mb-2 cursor-pointer hover:bg-gray-700">
                        <p class="text-xs font-bold text-blue-400">User ID: ${c.userId.substr(-4)}</p>
                        <p class="text-xs text-gray-300 truncate">${c.lastMessage}</p>
                    </div>`;
                });
                display.innerHTML = html;
            }
        } else {
            // Viewer View: Chat with Owner
            currentChatReceiverId = data.ownerId;
            inputArea.classList.remove('hidden');
            renderMessages(data.messages, data.ownerId);
        }
    } catch(e) { console.error("Chat load error", e); }
};

window.openSpecificChat = async function(postId, userId) {
    currentChatReceiverId = userId;
    // Show input for owner now
    document.getElementById('chat-input-area').classList.remove('hidden');
    
    // Fetch specific messages
    const res = await fetch(`${API_URL}/messages/${postId}/${userId}`, { headers: authHeaders() });
    const data = await res.json();
    renderMessages(data.messages, userId);
};

function renderMessages(messages, otherId) {
    const display = document.getElementById('chat-display');
    if(!messages || messages.length === 0) {
        display.innerHTML = `<p class="text-gray-500 text-center text-xs mt-10">Start the conversation...</p>`;
        return;
    }
    
    let html = '';
    messages.forEach(msg => {
        const isMe = msg.sender === currentUser._id || msg.sender === currentUser.id;
        html += `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'}">
            <div class="${isMe ? 'bg-blue-600' : 'bg-gray-700'} p-2 rounded-lg max-w-[80%] text-xs text-white">
                ${msg.content}
            </div>
        </div>`;
    });
    display.innerHTML = html;
    display.scrollTop = display.scrollHeight; // Auto scroll to bottom
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chat-msg-input');
    const content = input.value.trim();
    if(!content || !currentChatReceiverId) return;

    try {
        await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...authHeaders()},
            body: JSON.stringify({
                postId: currentChatPostId,
                receiverId: currentChatReceiverId,
                content
            })
        });
        input.value = '';
        // Immediate refresh
        const item = items.find(i => i._id === currentChatPostId);
        if(item.authorName === currentUser.username) {
            openSpecificChat(currentChatPostId, currentChatReceiverId);
        } else {
            loadChat(item);
        }
    } catch(e) { alert("Send failed"); }
};

// --- MISC UTILS (PIN) ---
window.generatePin = async function(id) {
    if(!currentUser) return openAuthModal('login');
    const res = await fetch(`${API_URL}/generate-pin/${id}`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if(data.pin) {
        const el = document.getElementById('pin-display');
        el.innerText = `PIN: ${data.pin}`;
        el.classList.remove('hidden');
    }
};

window.verifyPin = async function(id) {
    const pin = document.getElementById('verify-pin-input').value;
    const res = await fetch(`${API_URL}/verify-pin/${id}`, {
        method: 'POST',
        headers: {'Content-Type':'application/json', ...authHeaders()},
        body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if(data.success) { alert("Item Resolved!"); closeModals(); renderFeed(); }
    else alert("Invalid PIN");
};

window.closeModals = function() {
    document.querySelectorAll('[id^="modal-"]').forEach(el => el.classList.add('hidden'));
    if(chatPollInterval) clearInterval(chatPollInterval);
};

window.openAuthModal = (mode) => {
    document.getElementById('modal-auth').classList.remove('hidden');
    if(mode === 'login') {
        document.getElementById('auth-login-view').classList.remove('hidden');
        document.getElementById('auth-register-view').classList.add('hidden');
    } else {
        document.getElementById('auth-login-view').classList.add('hidden');
        document.getElementById('auth-register-view').classList.remove('hidden');
        document.getElementById('reg-step-1').classList.remove('hidden');
        document.getElementById('reg-step-2').classList.add('hidden');
    }
};

window.handleFileSelect = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => uploadedFileBase64 = evt.target.result;
    reader.readAsDataURL(file);
};