document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');
    const keyBox = document.getElementById('keyBox');
    const keyUrlInput = document.getElementById('keyUrl');
    const copyBtn = document.getElementById('copyBtn');
    const countdownEl = document.getElementById('countdown');

    let timerInterval = null;

    generateBtn.addEventListener('click', () => {
        // Generate a random 13-digit number sequence
        let randomKey = '';
        for (let i = 0; i < 13; i++) {
            randomKey += Math.floor(Math.random() * 10);
        }

        const baseUrl = window.location.origin;
        const generatedLink = `${baseUrl}/?key=${randomKey}`;
        keyUrlInput.value = generatedLink;

        keyBox.classList.remove('hidden');
        startTimer(24 * 60 * 60);
    });

    copyBtn.addEventListener('click', () => {
        keyUrlInput.select();
        navigator.clipboard.writeText(keyUrlInput.value);
        
        copyBtn.innerText = "COPIED!";
        copyBtn.style.background = "#00f0c8";
        setTimeout(() => {
            copyBtn.innerText = "COPY LINK";
        }, 2000);
    });

    function startTimer(durationSeconds) {
        if (timerInterval) clearInterval(timerInterval);
        let timer = durationSeconds;

        timerInterval = setInterval(() => {
            const hours = Math.floor(timer / 3600);
            const minutes = Math.floor((timer % 3600) / 60);
            const seconds = Math.floor(timer % 60);

            countdownEl.textContent = 
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            if (--timer < 0) {
                clearInterval(timerInterval);
                keyBox.classList.add('hidden');
                alert('Your 24-hour key link has expired. Please generate a new one.');
            }
        }, 1000);
    }
});
