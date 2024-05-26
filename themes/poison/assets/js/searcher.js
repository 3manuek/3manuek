document.addEventListener('DOMContentLoaded', function () {
    var searchInput = document.getElementById('search-input');
    var searchResults = document.getElementById('search-results');

    fetch('/index.json')
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
          var results = idx.search(query);

          searchResults.innerHTML = '';
          results.forEach(function (result) {
            var item = data.find(doc => doc.href === result.ref);
            var div = document.createElement('div');
            div.classList.add('search-result-item');
            div.innerHTML = `<a href="${item.href}">${item.title}</a>`;
            searchResults.appendChild(div);
          });
        });
      });
  });