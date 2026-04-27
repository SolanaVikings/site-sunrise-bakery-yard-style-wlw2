// ============================================
// GetMeOnlineFast — Booking Widget
// Only active when CONFIG.PLUGINS.ecommerce.booking.enabled
// This file is IDENTICAL across all client sites.
// ============================================

(function () {
    'use strict';

    if (typeof CONFIG === 'undefined' || !CONFIG.PLUGINS) return;
    var ecom = CONFIG.PLUGINS.ecommerce;
    if (!ecom || !ecom.enabled || !ecom.booking || !ecom.booking.enabled) return;

    var SITE_KEY = CONFIG.SITE_KEY || 'site';
    var ADVANCE_DAYS = ecom.booking.advanceDays || 30;
    var SUPABASE_URL = CONFIG.SUPABASE_URL;
    var ANON_KEY = CONFIG.SUPABASE_ANON_KEY;

    // State
    var currentMonth = new Date().getMonth();
    var currentYear = new Date().getFullYear();
    var selectedDate = null;
    var selectedSlot = null;

    // ---- Helpers ----
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function formatDate(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function formatDisplay(dateStr) {
        var parts = dateStr.split('-');
        var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    // ---- Calendar ----
    function renderCalendar() {
        var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        var titleEl = document.querySelector('.calendar-month-year');
        var daysEl = document.querySelector('.calendar-days');
        if (!titleEl || !daysEl) return;

        titleEl.textContent = monthNames[currentMonth] + ' ' + currentYear;

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + ADVANCE_DAYS);

        var firstDay = new Date(currentYear, currentMonth, 1);
        var startDow = (firstDay.getDay() + 6) % 7; // Monday=0
        var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        var html = '';
        // Empty cells before first day
        for (var e = 0; e < startDow; e++) {
            html += '<span class="calendar-day calendar-day--empty"></span>';
        }

        for (var d = 1; d <= daysInMonth; d++) {
            var date = new Date(currentYear, currentMonth, d);
            var dateStr = formatDate(date);
            var isPast = date < today;
            var isFuture = date > maxDate;
            var isDisabled = isPast || isFuture;
            var isSelected = selectedDate === dateStr;
            var isToday = date.getTime() === today.getTime();

            var cls = 'calendar-day';
            if (isDisabled) cls += ' calendar-day--disabled';
            if (isSelected) cls += ' calendar-day--selected';
            if (isToday) cls += ' calendar-day--today';

            if (isDisabled) {
                html += '<span class="' + cls + '">' + d + '</span>';
            } else {
                html += '<button class="' + cls + '" data-date="' + dateStr + '">' + d + '</button>';
            }
        }

        daysEl.innerHTML = html;
    }

    // ---- Steps navigation ----
    function showStep(n) {
        var steps = document.querySelectorAll('.booking-step');
        for (var i = 0; i < steps.length; i++) {
            steps[i].style.display = steps[i].getAttribute('data-step') === String(n) ? '' : 'none';
        }
    }

    // ---- Fetch slots ----
    async function loadSlots(dateStr) {
        var slotsEl = document.getElementById('booking-slots');
        if (!slotsEl) return;

        slotsEl.innerHTML = '<p class="booking-loading">Loading available times...</p>';
        showStep(2);

        try {
            var res = await fetch(SUPABASE_URL + '/functions/v1/get-availability', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + ANON_KEY
                },
                body: JSON.stringify({ site_key: SITE_KEY, date_from: dateStr, date_to: dateStr })
            });

            if (!res.ok) throw new Error('Failed to fetch slots');
            var data = await res.json();
            var slots = data.dates && data.dates.length > 0 ? data.dates[0].slots : (data.slots || []);

            if (slots.length === 0) {
                slotsEl.innerHTML = '<p class="booking-no-slots">No available times for this date. Please try another day.</p>';
                return;
            }

            var html = '';
            for (var i = 0; i < slots.length; i++) {
                var timeStr = typeof slots[i] === 'object' ? slots[i].time : slots[i];
                var display = timeStr.length > 5 ? timeStr.substring(0, 5) : timeStr; // HH:MM:SS → HH:MM
                html += '<button class="booking-slot-pill" data-time="' + timeStr + '">' + display + '</button>';
            }
            slotsEl.innerHTML = html;
        } catch (err) {
            console.error('Booking: error loading slots', err);
            slotsEl.innerHTML = '<p class="booking-no-slots">Could not load availability. Please try again.</p>';
        }
    }

    // ---- Submit booking ----
    async function submitBooking(formData) {
        try {
            var res = await fetch(SUPABASE_URL + '/functions/v1/create-booking', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + ANON_KEY
                },
                body: JSON.stringify({
                    site_key: SITE_KEY,
                    date: selectedDate,
                    time: selectedSlot,
                    customer_name: formData.name,
                    customer_email: formData.email,
                    customer_phone: formData.phone,
                    notes: formData.notes
                })
            });

            if (!res.ok) throw new Error('Booking failed');

            var confirmDetails = document.querySelector('.booking-confirm-details');
            if (confirmDetails) {
                confirmDetails.textContent = formData.name + ' - ' + formatDisplay(selectedDate) + ' at ' + selectedSlot;
            }
            showStep(4);
        } catch (err) {
            console.error('Booking: submit error', err);
            alert('Booking failed. Please try again or contact us directly.');
        }
    }

    // ---- Init ----
    function init() {
        renderCalendar();

        // Calendar nav
        var prevBtn = document.querySelector('.calendar-prev');
        var nextBtn = document.querySelector('.calendar-next');
        if (prevBtn) {
            prevBtn.addEventListener('click', function () {
                currentMonth--;
                if (currentMonth < 0) { currentMonth = 11; currentYear--; }
                renderCalendar();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function () {
                currentMonth++;
                if (currentMonth > 11) { currentMonth = 0; currentYear++; }
                renderCalendar();
            });
        }

        // Day selection
        var daysEl = document.querySelector('.calendar-days');
        if (daysEl) {
            daysEl.addEventListener('click', function (e) {
                var btn = e.target.closest('.calendar-day[data-date]');
                if (!btn) return;
                selectedDate = btn.getAttribute('data-date');
                renderCalendar();
                loadSlots(selectedDate);
            });
        }

        // Slot selection
        var slotsEl = document.getElementById('booking-slots');
        if (slotsEl) {
            slotsEl.addEventListener('click', function (e) {
                var pill = e.target.closest('.booking-slot-pill');
                if (!pill) return;
                selectedSlot = pill.getAttribute('data-time');
                // Highlight
                var all = slotsEl.querySelectorAll('.booking-slot-pill');
                for (var i = 0; i < all.length; i++) all[i].classList.remove('booking-slot-pill--selected');
                pill.classList.add('booking-slot-pill--selected');
                showStep(3);
            });
        }

        // Back buttons
        var backBtns = document.querySelectorAll('.booking-back');
        backBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var currentStep = btn.closest('.booking-step');
                var step = parseInt(currentStep.getAttribute('data-step'));
                showStep(step - 1);
            });
        });

        // Form submit
        var form = document.getElementById('booking-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Booking...';

                submitBooking({
                    name: form.querySelector('#booking-name').value.trim(),
                    email: form.querySelector('#booking-email').value.trim(),
                    phone: form.querySelector('#booking-phone').value.trim(),
                    notes: form.querySelector('#booking-notes').value.trim()
                }).finally(function () {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Confirm Booking';
                });
            });
        }

        // Book another
        var newBtn = document.querySelector('.booking-new');
        if (newBtn) {
            newBtn.addEventListener('click', function () {
                selectedDate = null;
                selectedSlot = null;
                if (form) form.reset();
                showStep(1);
                renderCalendar();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
