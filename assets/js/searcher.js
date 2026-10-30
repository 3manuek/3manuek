document.addEventListener('DOMContentLoaded', function () {
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  var currentIndex = -1;

  if (!searchInput || !searchResults || typeof lunr === 'undefined') return;

  fetch(searchInput.dataset.indexUrl)
    .then(response => response.json())
    .then(data => {
      var idx = lunr(function () {
        this.ref('href');
        this.field('title');
        this.field('content');

        data.forEach(function (doc) {
          this.add(doc);
        }, this);
      });

      searchInput.addEventListener('input', function () {
        var query = searchInput.value;
        var results;
        try {
          results = query.trim() ? idx.search(query) : [];
        } catch (error) {
          results = [];
        }

        searchResults.innerHTML = '';
        currentIndex = -1; // Reset the current index on new search

        results.forEach(function (result) {
          var item = data.find(doc => doc.href === result.ref);
          var div = document.createElement('div');
          div.classList.add('search-result-item');
          var link = document.createElement('a');
          link.href = item.href;
          link.textContent = item.title;
          div.appendChild(link);
          searchResults.appendChild(div);
        });
      });

      searchInput.addEventListener('keydown', function (event) {
        var items = document.querySelectorAll('.search-result-item');

        if (items.length > 0) {
          if (event.key === 'ArrowDown') {
            // Move down
            currentIndex = (currentIndex + 1) % items.length;
            updateSelection(items);
            event.preventDefault();
          } else if (event.key === 'ArrowUp') {
            // Move up
            currentIndex = (currentIndex - 1 + items.length) % items.length;
            updateSelection(items);
            event.preventDefault();
          } else if (event.key === 'Enter' && currentIndex >= 0) {
            // Navigate to the selected link
            items[currentIndex].querySelector('a').click();
          }
        }

        if (event.key === 'Escape') {
          searchInput.value = '';
          searchResults.innerHTML = '';
          currentIndex = -1;
        }
      });

      function updateSelection(items) {
        items.forEach((item, index) => {
          if (index === currentIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
          } else {
            item.classList.remove('selected');
          }
        });
      }
    }).catch(function () {
      searchResults.textContent = document.documentElement.lang.startsWith('es')
        ? 'La búsqueda no está disponible. Consulta la sección de artículos.'
        : 'Search is unavailable. Browse the articles section.';
    });
});
