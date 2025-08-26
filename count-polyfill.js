
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('c-count')) {
    const onsite = document.getElementById('c-onsite');
    const anchor = onsite ? onsite.closest('.form-group') : document.getElementById('c-create');
    if (anchor && anchor.parentElement) {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      wrap.innerHTML = '<label for="c-count">Number of Pots</label><input type="number" id="c-count" class="form-control" min="1" value="1" inputmode="numeric">';
      (anchor === document.getElementById('c-create') ? anchor.parentElement.insertBefore(wrap, anchor) : anchor.after(wrap));
    }
  }
});
