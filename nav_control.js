// File name: nav_controls.js
// File description: navigation control active state change

// update navigation buttons based on current path
function updateNavButtons() {
  const links = document.querySelectorAll('.controls a');
  const currentPath = window.location.pathname.split('/').pop();

  links.forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // Fetch nav.html and insert <nav> into <header>
  fetch("nav.html")
    .then(res => res.text())
    .then(html => {
      const header = document.querySelector("header");
      if (header) {
        // Create a temporary container to parse the nav
        const temp = document.createElement("div");
        temp.innerHTML = html.trim();
        const nav = temp.firstElementChild;

        // Insert nav as the FIRST element inside <header>
        // header.insertBefore(nav, header.firstChild);
        // Insert after dawg
        header.appendChild(nav);
        
        updateNavButtons(); // highlight current page
      }
    });
});
