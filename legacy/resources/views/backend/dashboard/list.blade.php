@extends('backend.layouts.app')

@section('content')
<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper dashboard" style="background-image: url('{{ asset('/dist/img/dashboard.jpg') }}'); background-size: cover; background-position: center;">

    <!-- Content Header (Page header) -->
    <div class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1 class="m-0 text">Dashboard</h1>
                </div><!-- /.col -->
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="#" class="text">Home</a></li>
                        <li class="breadcrumb-item active text">Dashboard</li>
                    </ol>
                </div><!-- /.col -->
            </div><!-- /.row -->
        </div><!-- /.container-fluid -->
    </div><!-- /.content-header -->

    <!-- Main content -->
    <section class="content">
        <div class="container-fluid">
            <!-- Stat boxes (Responsive) -->
            <div class="row">
                <!-- Employees -->
                <div class="col-lg-3 col-md-6 col-12">
                    <div class="small-box bg-info shadow-sm">
                        <div class="inner">
                            <h3>{{ $getEmployeeCount ?? '0' }}</h3>
                            <p>Employees</p>
                        </div>
                        <div class="icon">
                            <i class="fa fa-users"></i>
                        </div>
                    </div>
                </div>

                <!-- Present -->
                <div class="col-lg-3 col-md-6 col-12">
                    <div class="small-box bg-success shadow-sm">
                        <div class="inner">
                            <h3>{{ $presentCount }}</h3>
                            <p>Present</p>
                        </div>
                        <div class="icon">
                            <i class="fas fa-check"></i>
                        </div>
                    </div>
                </div>

                <!-- Late -->
                <div class="col-lg-3 col-md-6 col-12">
                    <div class="small-box bg-warning shadow-sm">
                        <div class="inner">
                            <h3>{{ $lateCount + $halfdayCount }}</h3>
                            <p>Late</p>
                        </div>
                        <div class="icon">
                            <i class="ion ion-clock"></i>
                        </div>
                    </div>
                </div>

                <!-- Absent -->
                <div class="col-lg-3 col-md-6 col-12">
                    <div class="small-box bg-danger shadow-sm">
                        <div class="inner">
                            <h3>{{ $absentCount }}</h3>
                            <p>Absent</p>
                        </div>
                        <div class="icon">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                </div>
            </div><!-- /.row -->

            <!-- Bar Chart Section -->
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card card-outline card-primary">
                        <div class="card-header" style="color: rgb(93, 93, 255)">
                            <h3 class="card-title">Monthly Performance</h3>
                        </div>
                        <div class="card-body">
                            <div class="chart">
                                <canvas id="barChart" style="min-height: 300px; height: 300px;"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div><!-- /.row -->

        </div><!-- /.container-fluid -->
    </section><!-- /.content -->
</div><!-- /.content-wrapper -->





<!-- Include Chart.js library -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- Include the separated JavaScript file -->
<script>
    var chartDataPresent = @json($Present);
    var chartDataAbsent = @json($absences);
    var chartDataVacations = @json($vacations);
</script>
<script src="{{ asset('dist/js/dashboardlist.js') }}"></script>


@endsection
