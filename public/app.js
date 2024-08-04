document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    const userInfo = document.getElementById('userInfo');
    const userPicture = document.getElementById('userPicture');
    const userName = document.getElementById('userName');
    const contentSection = document.getElementById('contentSection');
    const uploadForm = document.getElementById('uploadForm');
    const fileList = document.getElementById('fileList');
    const progressBar = document.getElementById('progressBar');
    const progressContainer = document.getElementById('progressContainer');
    const loginSection = document.getElementById('loginSection');

    function checkAuthStatus() {
        fetch('/user')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showLoginButton();
                } else {
                    showUserInfo(data);
                }
            })
            .catch(error => {
                console.error('Error checking auth status:', error);
                showLoginButton();
            });
    }

    function showLoginButton() {
        loginSection.classList.remove('d-none');
        userInfo.classList.add('d-none');
        contentSection.classList.add('d-none');
    }

    function showUserInfo(user) {
        userPicture.src = user.picture;
        userName.textContent = user.name;
        loginSection.classList.add('d-none');
        userInfo.classList.remove('d-none');
        contentSection.classList.remove('d-none');
        fetchFileList();
    }

    logoutBtn.addEventListener('click', () => {
        fetch('/logout', { method: 'POST' })
            .then(() => {
                showLoginButton();
            })
            .catch(error => console.error('Error logging out:', error));
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('file');
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select a file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            progressContainer.classList.remove('d-none');
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    updateProgressBar(Math.round(percentComplete));
                }
            };

            xhr.onload = function() {
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    alert(`File uploaded successfully. File ID: ${result.id}`);
                    uploadForm.reset();
                    fetchFileList();
                } else {
                    throw new Error('Failed to upload file');
                }
            };

            xhr.onerror = function() {
                throw new Error('Failed to upload file');
            };

            xhr.send(formData);
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to upload file. Please try again.');
        } finally {
            progressContainer.classList.add('d-none');
            updateProgressBar(0);
        }
    });

    function updateProgressBar(percent) {
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
    }

    async function fetchFileList() {
        try {
            const response = await fetch('/list-files');
            if (response.ok) {
                const files = await response.json();
                fileList.innerHTML = '';
                files.forEach(file => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${file.name}</td>
                        <td>${new Date(file.modifiedTime).toLocaleString()}</td>
                        <td>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton-${file.id}" data-bs-toggle="dropdown" aria-expanded="false">
                                    Actions
                                </button>
                                <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton-${file.id}">
                                    <li><a class="dropdown-item rename-btn" href="#" data-id="${file.id}">Rename</a></li>
                                    <li><a class="dropdown-item download-btn" href="#" data-id="${file.id}">Download</a></li>
                                    <li><hr class="dropdown-divider"></li>
                                    <li><a class="dropdown-item delete-btn" href="#" data-id="${file.id}">Delete</a></li>
                                </ul>
                            </div>
                        </td>
                    `;
                    fileList.appendChild(row);
                });
                addFileActions();
            } else {
                throw new Error('Failed to fetch file list');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to fetch file list. Please try again.');
        }
    }

    function addFileActions() {
        const deleteButtons = document.querySelectorAll('.delete-btn');
        const renameButtons = document.querySelectorAll('.rename-btn');
        const downloadButtons = document.querySelectorAll('.download-btn');

        deleteButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                const fileId = button.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this file?')) {
                    try {
                        const response = await fetch(`/delete/${fileId}`, { method: 'DELETE' });
                        if (response.ok) {
                            alert('File deleted successfully');
                            fetchFileList();
                        } else {
                            throw new Error('Failed to delete file');
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        alert('Failed to delete file. Please try again.');
                    }
                }
            });
        });

        renameButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                const fileId = button.getAttribute('data-id');
                const newName = prompt('Enter new file name:');
                if (newName) {
                    try {
                        const response = await fetch(`/update/${fileId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ newName }),
                        });
                        if (response.ok) {
                            alert('File renamed successfully');
                            fetchFileList();
                        } else {
                            throw new Error('Failed to rename file');
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        alert('Failed to rename file. Please try again.');
                    }
                }
            });
        });

        downloadButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const fileId = button.getAttribute('data-id');
                window.location.href = `/download/${fileId}`;
            });
        });
    }

    // Add event listener for file input change
    document.getElementById('file').addEventListener('change', (e) => {
        const fileName = e.target.files[0].name;
        document.getElementById('fileNameDisplay').textContent = fileName;
    });

    // Initial auth check when the page loads
    checkAuthStatus();
});