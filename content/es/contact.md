---
title: "Contacto"
date: 2025-11-28
draft: false
noSummary: true
---


<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
  <label>
    Tu email:
    <input type="email" name="email">
  </label>
  <label>
    Mensaje:
    <textarea name="message">
    Describe tu solicitud aquí.
    </textarea>
  </label>
  
  <!-- Campo honeypot  -->
  <input type="text" name="_gotcha" style="display:none">

  <div class="g-recaptcha" data-sitekey="YOUR_RECAPTCHA_SITE_KEY"></div>
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
  
  <button type="submit">Enviar</button>
</form>

