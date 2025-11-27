document.addEventListener('DOMContentLoaded', function() {
    
    const carousels = document.querySelectorAll('.carousel');
    carousels.forEach(function( carousel ) {
  
        const ele = carousel.querySelector('ul');
        if (!ele) return; // Safety check
        
        const amountvisible = Math.round(ele.offsetWidth/ele.querySelector('li:nth-child(1)').offsetWidth);
        let bullets = carousel.querySelectorAll('ol li');
        const slides = carousel.querySelectorAll('ul li');
        const nextarrow = carousel.querySelector('.next');
        const prevarrow = carousel.querySelector('.prev');
        
        if (!nextarrow || !prevarrow || slides.length === 0) return; // Safety checks
  
        // Initialize the carousel
        nextarrow.style.display = 'block';
        prevarrow.style.display = 'block';
        ele.scrollLeft = 0;
        if (bullets.length > 0) bullets[0].classList.add('selected');
        if (slides.length > 0) slides[0].classList.add('selected');
        
        if(amountvisible>1) {
          var removeels = carousel.querySelectorAll('ol li:nth-last-child(-n + '+(amountvisible-1)+')');
          removeels.forEach(function(removeel) {
            removeel.remove();
          });
          // Re-query bullets after removal
          bullets = carousel.querySelectorAll('ol li');
        }
  
        const setSelected = function() {
            bullets.forEach(function(bullet) {
               bullet.classList.remove('selected');
            });
            slides.forEach(function(slide) {
               slide.classList.remove('selected');
            });
            if (slides.length < 2) {
                if (bullets.length > 0) bullets[0].classList.add('selected');
                if (slides.length > 0) slides[0].classList.add('selected');
                return;
            }
            const scrolllength = slides[1].offsetLeft - slides[0].offsetLeft;
            if (scrolllength === 0) {
                if (bullets.length > 0) bullets[0].classList.add('selected');
                if (slides.length > 0) slides[0].classList.add('selected');
                return;
            }
            const nthchild = Math.max(1, Math.min(Math.round((ele.scrollLeft/scrolllength)+1), slides.length));
            if (bullets.length >= nthchild) bullets[nthchild - 1].classList.add('selected');
            if (slides.length >= nthchild) slides[nthchild - 1].classList.add('selected');
            if(carousel.parentElement.parentElement.querySelector('.dynamictitle')) {
                const title = slides[nthchild - 1].querySelector('img');
                if(title && title.getAttribute('title')) {
                    carousel.parentElement.parentElement.querySelector('.dynamictitle').innerHTML = title.getAttribute('title');
                }
            }
        }
  
        const scrollTo = function(event) {
            event.preventDefault();
            event.stopPropagation();
            const slideIndex = parseInt(this.getAttribute('data-slide-index'));
            if (slideIndex && slideIndex >= 1 && slideIndex <= slides.length) {
                scrollToSlide(slideIndex);
            }
        }
        
        const scrollToSlide = function(slideIndex) {
            // slideIndex is 1-based (nth-child is 1-indexed)
            if (slideIndex < 1 || slideIndex > slides.length) return;
            const targetSlide = slides[slideIndex - 1];
            if (targetSlide) {
                // Only use scrollLeft to prevent any page scrolling
                const targetLeft = targetSlide.offsetLeft;
                // Prevent any potential page scroll by ensuring we're only scrolling the carousel
                ele.scrollLeft = targetLeft;
            }
        }
        
        const getCurrentSlideIndex = function() {
            if (slides.length <= 1) return 1;
            const scrolllength = slides[1].offsetLeft - slides[0].offsetLeft;
            if (scrolllength === 0) return 1;
            const calculated = Math.round((ele.scrollLeft/scrolllength)+1);
            return Math.max(1, Math.min(calculated, slides.length));
        }
        
        const nextSlide = function(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (slides.length <= 1) return;
            const currentSlideIndex = getCurrentSlideIndex();
            const nextIndex = currentSlideIndex < slides.length ? currentSlideIndex + 1 : 1;
            scrollToSlide(nextIndex);
        }
  
        const prevSlide = function(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (slides.length <= 1) return;
            const currentSlideIndex = getCurrentSlideIndex();
            const prevIndex = currentSlideIndex > 1 ? currentSlideIndex - 1 : slides.length;
            scrollToSlide(prevIndex);
        }
        
        const setInteracted = function() {
          ele.classList.add('interacted');
        }
        
        // Track hover state for autoplay
        let isHovered = false;
        let autoplayInterval = null;
        
        carousel.addEventListener('mouseenter', function() {
          isHovered = true;
        });
        carousel.addEventListener('mouseleave', function() {
          isHovered = false;
        });
            
        // Attach the handlers
        ele.addEventListener("scroll", debounce(setSelected));
        ele.addEventListener("touchstart", setInteracted);
        ele.addEventListener('keydown', function (e){
            if(e.key == 'ArrowLeft') ele.classList.add('interacted');
            if(e.key == 'ArrowRight') ele.classList.add('interacted');
        });
  
        nextarrow.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            nextSlide(e);
        });
        nextarrow.addEventListener("mousedown", setInteracted);
        nextarrow.addEventListener("touchstart", setInteracted);
  
        prevarrow.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            prevSlide(e);
        });
        prevarrow.addEventListener("mousedown", setInteracted);
        prevarrow.addEventListener("touchstart", setInteracted);
  
        bullets.forEach(function(bullet) {
          const anchor = bullet.querySelector('a');
          if (anchor) {
            anchor.addEventListener('click', scrollTo);
            // Also prevent default on the anchor itself
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                return false;
            });
          }
          bullet.addEventListener("mousedown", setInteracted);
          bullet.addEventListener("touchstart", setInteracted);
        });
  
        //setInterval for autoplay - only if there's more than one slide
        if (slides.length > 1) {
          const durationAttr = carousel.getAttribute('duration');
          if(durationAttr) {
            const duration = parseInt(durationAttr, 10);
            if (!isNaN(duration) && duration > 0) {
              // Wait a bit for images to load and layout to settle
              setTimeout(function() {
                autoplayInterval = setInterval(function(){ 
                  // Check if carousel is being hovered or user has interacted
                  if (!isHovered && !ele.classList.contains('interacted')) {
                    nextSlide();
                  }
                }, duration);
              }, 1000); // Increased delay to ensure layout is ready
            }
          }
        }
      
      
    }); //end foreach
  
  }); //end onload
  
  
  /**
  * Debounce functions for better performance
  * (c) 2021 Chris Ferdinandi, MIT License, https://gomakethings.com
  * @param  {Function} fn The function to debounce
  */
  function debounce (fn) {
  // Setup a timer
  let timeout;
  // Return a function to run debounced
  return function () {
    // Setup the arguments
    let context = this;
    let args = arguments;
    // If there's a timer, cancel it
    if (timeout) {
      window.cancelAnimationFrame(timeout);
    }
    // Setup the new requestAnimationFrame()
    timeout = window.requestAnimationFrame(function () {
      fn.apply(context, args);
    });
  };
  }
