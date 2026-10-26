@extends('backend.layouts.app')

@section('content')
<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/dashboard.jpg') }}'); background-size: cover; background-position: center;">

    <!-- Content Header (Page header) -->
    <div class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1 class="m-0 text">Reports </h1>
                </div><!-- /.col -->
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="#" class="text">Home</a></li>
                        <li class="breadcrumb-item active text">Charts</li>
                    </ol>
                </div><!-- /.col -->
            </div><!-- /.row -->
        </div><!-- /.container-fluid -->
    </div><!-- /.content-header -->

    <!-- Main content -->
    <section class="content">
        <div class="container-fluid">
            <h5 class="mb-2">Basic Information</h5>
            <div class="row">
                <div class="col-md-3 col-sm-6 col-12">
                    <div class="info-box">
                        <span class="info-box-icon bg-info"><i class="nav-icon fa fa-users"></i></span>
                        <div class="info-box-content">
                            <span class="info-box-text">Employees</span>
                            <span class="info-box-number">{{ $getEmployeeCount }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6 col-12">
                    <div class="info-box">
                        <span class="info-box-icon bg-success"><i class="far fa-user"></i></span>
                        <div class="info-box-content">
                            <span class="info-box-text">Managers</span>
                            <span class="info-box-number">{{ $getManagersCount }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6 col-12">
                    <div class="info-box">
                        <span class="info-box-icon bg-warning"><i class="fa fa-suitcase"></i></span>
                        <div class="info-box-content">
                            <span class="info-box-text">Jobs</span>
                            <span class="info-box-number">{{ $getJobsCount }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6 col-12">
                    <div class="info-box">
                        <span class="info-box-icon bg-gray"><i class="far fa-building"></i></span>
                        <div class="info-box-content">
                            <span class="info-box-text">Departments</span>
                            <span class="info-box-number">{{ $getDepartmentCount }}</span>
                        </div>
                    </div>
                </div>
            </div>



            <!-- Charts row -->
            <div class="row">
                <!-- Pie Chart Section -->
                <div class="col-md-6">
                    <div class="card card-outline card-primary">
                        <div class="card-header" style="color: rgb(93, 93, 255)">
                            <h3 class="card-title">Departments Overview</h3>
                        </div>
                        <div class="card-body">
                            <div class="chart">
                                <canvas id="pieChart" style="min-height: 300px; height: 300px;"></canvas>
                            </div>
                        </div>
                    </div>
                </div><!-- /.col-md-6 -->




                <!-- Bar Chart Section -->
                <div class="col-md-6">
                    <div class="card card-outline card-primary">
                        <div class="card-header" style="color: rgb(93, 93, 255)">
                            <h3 class="card-title">Top Employees This Month</h3>
                        </div>
                        <div class="card-body">
                            <div class="chart">
                                <canvas id="barChart2" style="min-height: 300px; height: 300px;"></canvas>
                            </div>
                        </div>
                    </div>
                </div><!-- /.col-md-6 -->
            </div><!-- /.row -->
        </div><!-- /.container-fluid -->
    </section><!-- /.content -->
</div><!-- /.content-wrapper -->





<!-- Include Chart.js library -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- Pass the data from Blade to JavaScript -->
<script>
    var departmentNames = @json($departmentNames);
    var employeeCounts = @json($employeeCounts);
    var employeeNames = @json($employeeNames);
    var overtimeHours = @json($overtimeHours);
</script>

<!-- Include the external JavaScript file -->
<script src="{{ asset('dist/js/charts.js') }}"></script>




@endsection
