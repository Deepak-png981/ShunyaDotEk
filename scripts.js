document.getElementById('addTrack').addEventListener('change', function (event) {
    var files = event.target.files;
    for (var i = 0; i < files.length; i++) {
        addTrack(files[i]);
    }
});

document.getElementById('exportButton').addEventListener('click', function () {
    var format = document.getElementById('exportFormat').value;
    exportTracks(format);
});

function addTrack(file) {
    var fileURL = URL.createObjectURL(file);
    var trackContainer = document.createElement('div');
    trackContainer.className = 'track-container';

    // Create play and stop buttons
    var trackControls = document.createElement('div');
    trackControls.className = 'track-controls';

    var playButton = document.createElement('button');
    playButton.className = 'play-button';
    playButton.textContent = 'Play';
    trackControls.appendChild(playButton);

    var stopButton = document.createElement('button');
    stopButton.className = 'stop-button';
    stopButton.textContent = 'Stop';
    trackControls.appendChild(stopButton);

    trackContainer.appendChild(trackControls);

    // Create audio player
    var audioPlayer = document.createElement('audio');
    audioPlayer.className = 'audioPlayer';
    audioPlayer.src = fileURL;
    audioPlayer.controls = false;
    trackContainer.appendChild(audioPlayer);

    // Create waveform canvas
    var canvas = document.createElement('canvas');
    canvas.className = 'waveform';
    trackContainer.appendChild(canvas);

    document.getElementById('tracks').appendChild(trackContainer);

    drawWaveform(fileURL, canvas, audioPlayer);


    // Update playback position line on the waveform as the audio plays
    audioPlayer.addEventListener('timeupdate', function () {
        drawWaveform(fileURL, canvas, audioPlayer);
    });

    // Play button functionality
    playButton.addEventListener('click', function () {
        audioPlayer.play();
    });

    // Stop button functionality
    stopButton.addEventListener('click', function () {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    });
}

function drawWaveform(fileURL, canvas, audioElement) {
    var context = canvas.getContext('2d');

    fetch(fileURL).then(response => response.arrayBuffer()).then(data => {
        var audioContext = new (window.AudioContext || window.webkitAudioContext)();
        return audioContext.decodeAudioData(data);
    }).then(audioBuffer => {
        var channelData = audioBuffer.getChannelData(0);
        var step = Math.ceil(channelData.length / canvas.width);
        var amp = canvas.height / 4; // Reduce the amplitude scaling factor

        context.fillStyle = 'black';
        context.clearRect(0, 0, canvas.width, canvas.height);

        context.beginPath(); // Begin a new path for the waveform

        for (var i = 0; i < canvas.width; i++) {
            var min = 1.0;
            var max = -1.0;
            for (var j = 0; j < step; j++) {
                var datum = channelData[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            var yLow = (1 + min) * amp;
            var yHigh = (1 + max) * amp;

            context.moveTo(i, yLow);
            context.lineTo(i, yHigh); // Draw lines instead of rectangles
        }

        context.lineWidth = 1; // Set the line width
        context.strokeStyle = 'black';
        context.stroke(); // Stroke the path to draw the waveform

        // Draw current playback position
        var currentTime = audioElement.currentTime;
        var duration = audioElement.duration;
        var position = (currentTime / duration) * canvas.width;
        context.lineWidth = 2; // Adjust the line width of the seek bar
        context.strokeStyle = 'red';
        context.beginPath();
        context.moveTo(position, 0);
        context.lineTo(position, canvas.height);
        context.stroke();
    });
}

// export button
document.getElementById('exportButton').addEventListener('click', function () {
    var format = document.getElementById('exportFormat').value;
    exportTracks(format);
});

function exportTracks(format) {
    var audioPlayers = document.querySelectorAll('.audioPlayer');
    var audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Load audio buffers
    var promises = [];
    audioPlayers.forEach(function (audioPlayer) {
        promises.push(fetchBuffer(audioPlayer.src, audioContext));
    });

    Promise.all(promises).then(function (buffers) {
        // Determine the total length (assuming all tracks are of the same length)
        var totalLength = buffers[0].length;

        // Create a buffer to store the compiled audio
        var numberOfChannels = buffers[0].numberOfChannels;
        var combinedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, audioContext.sampleRate);

        // Merge all tracks into the buffer
        for (var channel = 0; channel < numberOfChannels; channel++) {
            var combinedChannelData = combinedBuffer.getChannelData(channel);
            buffers.forEach(function (buffer) {
                var channelData = buffer.getChannelData(channel);
                for (var i = 0; i < channelData.length; i++) {
                    combinedChannelData[i] += channelData[i];
                }
            });
        }

        // Create a blob with the compiled audio data
        var blob = bufferToWav(combinedBuffer);

        // Create a download link and trigger the download
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'compiled_audio.' + format;
        a.click();
    });
}

function fetchBuffer(url, audioContext) {
    return fetch(url).then(function (response) {
        return response.arrayBuffer();
    }).then(function (arrayBuffer) {
        return audioContext.decodeAudioData(arrayBuffer);
    });
}
function bufferToWav(audioBuffer) {
    var numOfChannels = audioBuffer.numberOfChannels;
    var length = audioBuffer.length * numOfChannels * 2 + 44;
    var buffer = new ArrayBuffer(length);
    var view = new DataView(buffer);
    var pos = 0;

    // Write WAV header
    writeString("RIFF");
    view.setUint32(pos, length - 8, true); pos += 4;
    writeString("WAVEfmt ");
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2; // PCM format
    view.setUint16(pos, numOfChannels, true); pos += 2;
    view.setUint32(pos, audioBuffer.sampleRate, true); pos += 4;
    view.setUint32(pos, audioBuffer.sampleRate * 2 * numOfChannels, true); pos += 4;
    view.setUint16(pos, numOfChannels * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2; // 16-bit
    writeString("data");
    view.setUint32(pos, length - pos - 4, true); pos += 4;

    // Write interleaved data
    for (var i = 0; i < audioBuffer.length; i++) {
        for (var channel = 0; channel < numOfChannels; channel++) {
            var sample = audioBuffer.getChannelData(channel)[i];
            sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
    }

    // Create Blob
    return new Blob([buffer], { type: "audio/wav" });

    function writeString(str) {
        for (var i = 0; i < str.length; i++) {
            view.setUint8(pos, str.charCodeAt(i));
            pos++;
        }
    }
}

// Handle mouse events on the waveform to update playback position
// document.addEventListener('click', function (event) {
//     if (event.target.className === 'waveform') {
//         var canvas = event.target;
//         var audioPlayer = canvas.previousSibling;
//         var x = event.offsetX;
//         var width = canvas.width;
//         var duration = audioPlayer.duration;
//         var newTime = (x / width) * duration;
//         audioPlayer.currentTime = newTime;
//     }
// });