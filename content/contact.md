---
title: "Contact"
date: 2025-11-28
draft: false
noSummary: true
---


<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
  <label>
    Your email:
    <input type="email" name="email">
  </label>
  <label>
    Message:
    <textarea name="message">
    Describe your  request here. 
    </textarea>
  </label>
  
  <!-- Honeypot field -->
  <input type="text" name="_gotcha" style="display:none">
  

  <div class="g-recaptcha" data-sitekey="YOUR_RECAPTCHA_SITE_KEY"></div>
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
  
  <button type="submit">Send</button>
</form>

