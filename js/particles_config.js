// Determine initial color based on saved theme - default to dark mode
const savedTheme = localStorage.getItem('theme');
const isDarkMode = savedTheme !== 'light';
const particleColor = isDarkMode ? '#ffffff' : '#000000';

particlesJS('particles-js', {
  "particles": {
    "number": {
      "value": 80,
      "density": {
        "enable": true,
        "value_area": 800
      }
    },
    "color": {
      "value": particleColor
    },
    "shape": {
      "type": "circle"
    },
    "opacity": {
      "value": 0.5,
      "random": false,
      "anim": {
        "enable": true,
        "speed": 1,
        "opacity_min": 0.1,
        "sync": false
      }
    },
    "size": {
      "value": 3,
      "random": true,
      "anim": {
        "enable": true,
        "speed": 2,
        "size_min": 0.1,
        "sync": false
      }
    },
    "line_linked": {
      "enable": true,
      "distance": 150,
      "color": particleColor,
      "opacity": 0.4,
      "width": 1
    },
    "move": {
      "enable": true,
      "speed": 2,
      "direction": "none",
      "random": false,
      "straight": false,
      "out_mode": "out",
      "bounce": false,
      "attract": {
        "enable": false,
        "rotateX": 600,
        "rotateY": 1200
      }
    }
  },
  "interactivity": {
    "detect_on": "window",
    "events": {
      "onhover": {
        "enable": true,
        "mode": ["grab", "attract"]
      },
      "onclick": {
        "enable": true,
        "mode": "push"
      },
      "resize": true
    },
    "modes": {
      "grab": {
        "distance": 140,
        "line_linked": {
          "opacity": 1
        }
      },
      "attract": {
        "distance": 200,
        "duration": 0.4,
        "speed": 1
      },
      "push": {
        "particles_nb": 4
      }
    }
  },
  "retina_detect": true
});

// ===== FIREFLY EFFECT =====
// Random particles glow brighter and fade like fireflies
function fireflyGlow() {
  if (!window.pJSDom || !window.pJSDom[0]) return;

  const pJS = window.pJSDom[0].pJS;
  const particles = pJS.particles.array;

  if (particles.length === 0) return;

  // Pick 3 random particles to glow together
  for (let n = 0; n < 3; n++) {
    const index = Math.floor(Math.random() * particles.length);
    const particle = particles[index];

    // Store original values
    const originalOpacity = particle.opacity;
    const originalSize = particle.radius;

    // Animate the glow
    let frame = 0;
    const totalFrames = 60; // ~1 second at 60fps

    function animate() {
      frame++;
      const progress = frame / totalFrames;

      // Glow using sine wave
      const glow = Math.sin(progress * Math.PI);
      particle.opacity = Math.min(1, originalOpacity + (0.7 * glow));
      particle.radius = originalSize + (3 * glow);

      if (frame < totalFrames) {
        requestAnimationFrame(animate);
      } else {
        particle.opacity = originalOpacity;
        particle.radius = originalSize;
      }
    }

    animate();
  }
}

// ===== SCHEDULE EFFECTS =====

// Firefly effect - frequent glows
function scheduleFirefly() {
  const delay = 300 + Math.random() * 700; // 0.3-1 seconds
  setTimeout(() => {
    fireflyGlow();
    scheduleFirefly();
  }, delay);
}

// Start effects after particles are initialized
setTimeout(() => {
  scheduleFirefly();
}, 1500);
