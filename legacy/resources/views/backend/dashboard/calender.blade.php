@extends('backend.layouts.app')
@section('content')


  {{-- mina css --}}
  <link rel="stylesheet" href="{{ url('dist/css/calender.css') }}">

<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/dashboard.jpg') }}'); background-size: cover; background-position: center;">

    <!-- Content Header (Page header) -->
    <div class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1 class="m-0 text">Calendar</h1>
                </div><!-- /.col -->
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="#" class="text">Home</a></li>
                        <li class="breadcrumb-item active text">Calendar</li>
                    </ol>
                </div><!-- /.col -->
            </div><!-- /.row -->
        </div><!-- /.container-fluid -->
    </div><!-- /.content-header -->

    <div class="card">
        <div class="card-header">
            <h3 class="card-title">Calendar</h3>
            <div class="card-tools">
                <button type="button" class="btn btn-tool" data-card-widget="collapse">
                    <i class="fas fa-minus"></i>
                </button>
                <button type="button" class="btn btn-tool" data-card-widget="remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <div class="card-body">

            <h4>{{ \Carbon\Carbon::create($year, $month)->format('F Y') }}</h4>
            <table>
                <thead>
                    <tr>
                        <th>Sun</th>
                        <th>Mon</th>
                        <th>Tue</th>
                        <th>Wed</th>
                        <th>Thu</th>
                        <th>Fri</th>
                        <th>Sat</th>
                    </tr>
                </thead>
                <tbody>
                    @php
                        $day = 1;
                        $emptyCells = $firstDayOfMonth;
                    @endphp

                    @for ($week = 0; $week < 6; $week++)
                        <tr>
                            @for ($cell = 0; $cell < 7; $cell++)
                                @if ($emptyCells > 0)
                                    <td class="empty"></td>
                                    @php $emptyCells--; @endphp
                                @elseif ($day <= $daysInMonth)
                                    @php
                                        $currentDateCell = \Carbon\Carbon::create($year, $month, $day)->format('Y-m-d');
                                        $isWeekend = \Carbon\Carbon::create($year, $month, $day)->dayOfWeek === 5 || \Carbon\Carbon::create($year, $month, $day)->dayOfWeek === 6; // Check for Friday (5) and Saturday (6)
                                        $isEvent = array_key_exists($currentDateCell, $events);
                                        $isCurrentDay = $currentDateCell === $currentDate;
                                    @endphp
                                    <td class="{{ $isWeekend ? 'weekend' : '' }} {{ $isEvent ? 'event' : '' }} {{ $isCurrentDay ? 'current' : '' }}">
                                        {{ $day }}
                                        @if ($isEvent)
                                            <br>{{ $events[$currentDateCell] }}
                                        @endif
                                    </td>
                                    @php $day++; @endphp
                                @else
                                    <td class="empty"></td>
                                @endif
                            @endfor
                        </tr>
                    @endfor
                </tbody>
            </table>
        </div>
    </div>
</div>
@endsection
